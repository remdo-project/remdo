"""Workspace files and history: the only module that writes workspace files."""

import hashlib
import unicodedata
from dataclasses import dataclass

from django.db import transaction

from .models import (
    FILE_MAX_BYTES,
    PATH_MAX_LENGTH,
    Blob,
    Revision,
    RevisionChange,
    Workspace,
    WorkspaceFile,
)


class StoreError(ValueError):
    pass


class StaleFile(StoreError):
    """A file, or the paths under a folder, changed since the caller read them."""

    def __init__(self, message, path):
        super().__init__(message)
        self.path = path


class NoChanges(StoreError):
    pass


class InvalidPath(StoreError):
    pass


class InvalidContent(StoreError):
    pass


WINDOWS_RESERVED_NAMES = {"con", "prn", "aux", "nul", "conin$", "conout$"} | {
    f"{device}{number}"
    for device in ("com", "lpt")
    for number in [*"0123456789", *"\u00b9\u00b2\u00b3"]
}
GIT_RESERVED_NAMES = {".git", "git~1"}
SEGMENT_MAX_BYTES = 255
WINDOWS_FORBIDDEN_CHARS = set('<>:"|?*\\')


@dataclass(frozen=True)
class File:
    """A file's content and content hash; both are None when the path doesn't exist.

    Pass `blob_hash` back to `commit` as the expected content for this path.
    """

    path: str
    content: bytes | None
    blob_hash: str | None


def normalize_path(path):
    if not isinstance(path, str):
        raise InvalidPath("Path must be text.")
    path = unicodedata.normalize("NFC", path)
    if any(unicodedata.category(char) == "Cs" for char in path):
        raise InvalidPath("Path must be valid Unicode text.")
    # Windows measures paths in UTF-16 units; the limit leaves room within its default
    # 260-unit maximum for the folder a workspace is cloned into.
    if not path or len(path.encode("utf-16-le")) // 2 > PATH_MAX_LENGTH:
        raise InvalidPath(f"Path must have 1 to {PATH_MAX_LENGTH} characters.")
    if any(unicodedata.category(char) == "Cc" or char in WINDOWS_FORBIDDEN_CHARS for char in path):
        raise InvalidPath("Path can't contain control characters or any of <>:\"|?*\\.")
    for segment in path.split("/"):
        if segment in ("", ".", ".."):
            raise InvalidPath("Path must be relative, with no empty, '.' or '..' segments.")
        if len(segment.encode()) > SEGMENT_MAX_BYTES:
            raise InvalidPath(f"Path segment {segment[:40]!r}... is longer than filesystems allow.")
        # Windows can't check out these names, so a clone there would fail.
        device = segment.split(".")[0].rstrip(" ").casefold()
        if segment[-1] in ". " or device in WINDOWS_RESERVED_NAMES:
            raise InvalidPath(f"Path segment {segment!r} isn't valid on Windows.")
        # Git refuses these on checkout, ignoring case and the invisible characters macOS drops.
        visible = "".join(char for char in segment if unicodedata.category(char) != "Cf")
        if visible.casefold() in GIT_RESERVED_NAMES:
            raise InvalidPath(f"Path segment {segment!r} is reserved by Git.")
    return path


def blob_hash(content):
    if not isinstance(content, bytes):
        raise InvalidContent("Content must be bytes.")
    if len(content) > FILE_MAX_BYTES:
        raise InvalidContent(f"Files are limited to {FILE_MAX_BYTES} bytes.")
    return hashlib.sha256(content).hexdigest()


def read(workspace, path):
    path = normalize_path(path)
    row = (
        WorkspaceFile.objects.select_related("blob").filter(workspace=workspace, path=path).first()
    )
    if row is None:
        return File(path, None, None)
    return File(path, bytes(row.blob.content), row.blob_id)


@dataclass(frozen=True)
class Listing:
    """The files under a folder, or under the whole workspace when the folder is "".

    `files` maps each path to its blob hash. Pass `version` back to `commit` as the listing
    expected under this folder.
    """

    folder: str
    files: dict[str, str]
    version: str

    @property
    def paths(self):
        return list(self.files)


def _files_under(workspace, folder):
    files = WorkspaceFile.objects.filter(workspace=workspace)
    if folder:
        files = files.filter(path__startswith=f"{folder}/")
    return dict(files.order_by("path").values_list("path", "blob_id"))


def listing_version(files):
    """The version of a listing whose `files` map each path to its blob hash."""
    lines = "".join(f"{hash_} {path}\n" for path, hash_ in sorted(files.items()))
    return hashlib.sha256(lines.encode()).hexdigest()


def list_paths(workspace, folder=""):
    folder = normalize_path(folder) if folder else ""
    files = _files_under(workspace, folder)
    return Listing(folder, files, listing_version(files))


def commit(workspace, author, message, changes, folders=None):
    """Apply `changes` as one new revision on top of the head.

    `changes` maps each path to `(expected, content)`: `expected` is the blob hash the caller
    read, or None for a file it saw missing, and `content` is the new bytes, or None to delete
    the file. `folders` maps a folder to the listing version the caller read. Raises StaleFile,
    writing nothing, when any of those files or listings differs from what the caller expects.
    """
    prepared = {}
    for path, (expected, content) in changes.items():
        path = normalize_path(path)
        if path in prepared:
            raise InvalidPath(f"Path {path!r} appears twice.")
        prepared[path] = (expected, None if content is None else blob_hash(content), content)
    folders = {normalize_path(folder): version for folder, version in (folders or {}).items()}
    return _apply(workspace, author, message, prepared, folders)


@transaction.atomic
def _apply(workspace, author, message, prepared, folders):
    # Serializes commits per workspace: a row lock on PostgreSQL, and SQLite's IMMEDIATE
    # transactions already allow one writer at a time.
    locked = Workspace.objects.select_for_update().get(pk=workspace.pk)
    for folder, expected in folders.items():
        if listing_version(_files_under(locked, folder)) != expected:
            raise StaleFile(f"The files under {folder!r} changed since they were listed.", folder)
    current = dict(
        WorkspaceFile.objects.filter(workspace=locked, path__in=prepared).values_list(
            "path", "blob_id"
        )
    )
    writes, deletes, contents = {}, set(), {}
    for path, (expected, hash_, content) in prepared.items():
        existing = current.get(path)
        if existing != expected:
            raise StaleFile(f"{path!r} changed since it was read.", path)
        if hash_ is None:
            if existing is None:
                raise InvalidPath(f"Can't delete missing path {path!r}.")
            deletes.add(path)
        elif hash_ != existing:
            writes[path] = hash_
            contents[hash_] = content
    if not writes and not deletes:
        raise NoChanges("The changes match the current files.")

    added = sorted(writes.keys() - current.keys())
    if added:
        _check_namespace(locked, added, deletes)

    stored = set(Blob.objects.filter(hash__in=contents).values_list("hash", flat=True))
    # Sorted, so commits sharing new blobs insert them in the same order and can't deadlock.
    Blob.objects.bulk_create(
        [Blob(hash=hash_, content=contents[hash_]) for hash_ in sorted(contents.keys() - stored)],
        ignore_conflicts=True,
    )
    revision = Revision.objects.create(
        workspace=locked, parent_id=locked.head_id, author=author, message=message
    )
    RevisionChange.objects.bulk_create(
        [
            RevisionChange(revision=revision, path=path, blob_id=writes.get(path))
            for path in sorted(writes.keys() | deletes)
        ]
    )
    WorkspaceFile.objects.filter(workspace=locked, path__in=deletes).delete()
    WorkspaceFile.objects.bulk_create(
        [
            WorkspaceFile(workspace=locked, path=path, blob_id=hash_)
            for path, hash_ in writes.items()
        ],
        update_conflicts=True,
        unique_fields=["workspace", "path"],
        update_fields=["blob"],
    )
    locked.head = revision
    locked.save(update_fields=["head"])
    workspace.head = revision
    return revision


def _folders(path):
    segments = path.split("/")
    return ["/".join(segments[:depth]) for depth in range(1, len(segments))]


def _check_namespace(workspace, added, deleted):
    """Reject added paths that a case-insensitive filesystem couldn't hold beside the rest."""
    files, folders = {}, {}

    def place(path):
        files[path.casefold()] = path
        for folder in _folders(path):
            folders.setdefault(folder.casefold(), folder)

    for path in (
        WorkspaceFile.objects.filter(workspace=workspace)
        .exclude(path__in=deleted)
        .values_list("path", flat=True)
    ):
        place(path)
    for path in added:
        key = path.casefold()
        if key in files:
            raise InvalidPath(f"Paths {files[key]!r} and {path!r} differ only by case.")
        if key in folders:
            raise InvalidPath(f"{path!r} is a folder, so it can't also be a file.")
        for folder in _folders(path):
            folder_key = folder.casefold()
            if folder_key in files:
                raise InvalidPath(
                    f"{files[folder_key]!r} is a file, so {path!r} can't be inside it."
                )
            if folders.get(folder_key, folder) != folder:
                raise InvalidPath(
                    f"Folder {folder!r} differs only by case from {folders[folder_key]!r}."
                )
        place(path)


def files_at(revision):
    """Rebuild a revision's files.

    History is a single line and revision IDs grow with each commit, so a revision's ancestry is
    every revision of its workspace up to its own ID.
    """
    final = dict(
        RevisionChange.objects.filter(
            revision__workspace_id=revision.workspace_id, revision_id__lte=revision.pk
        )
        .order_by("revision_id")
        .values_list("path", "blob_id")
    )
    hashes = {hash_ for hash_ in final.values() if hash_ is not None}
    contents = dict(Blob.objects.filter(hash__in=hashes).values_list("hash", "content"))
    return {path: bytes(contents[hash_]) for path, hash_ in final.items() if hash_ is not None}
