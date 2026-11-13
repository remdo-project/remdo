"""Workspace files and history: the only module that writes workspace files."""

import hashlib
import unicodedata
from dataclasses import dataclass
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .models import (
    FILE_MAX_BYTES,
    PATH_MAX_LENGTH,
    Blob,
    Revision,
    RevisionChange,
    Workspace,
    WorkspaceFile,
    delete_unreferenced_blobs,
)

CONTINUE_WITHIN = timedelta(minutes=2)
OPEN_AT_MOST = timedelta(minutes=10)


class StoreError(ValueError):
    pass


class StaleFile(StoreError):
    """A file, or the files under a folder, changed since the caller read them.

    `current` is the file's blob hash or the folder's listing version, as it is now.
    """

    def __init__(self, message, path, current, folder=False):
        super().__init__(message)
        self.path = path
        self.current = current
        self.folder = folder


class NoChanges(StoreError):
    pass


class InvalidPath(StoreError):
    pass


class PathTaken(InvalidPath):
    """An added path collides with what's stored; `occupants` maps what holds it to its version."""

    def __init__(self, message, path, occupants):
        super().__init__(message)
        self.path = path
        self.occupants = occupants


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


def normalize_folder(path):
    """Normalize a folder path, where "" is the whole workspace."""
    return normalize_path(path) if path else ""


def blob_hash(content):
    if not isinstance(content, bytes):
        raise InvalidContent("Content must be bytes.")
    if len(content) > FILE_MAX_BYTES:
        raise InvalidContent(f"Files are limited to {FILE_MAX_BYTES} bytes.")
    return hashlib.sha256(content).hexdigest()


def version(workspace, path):
    """The blob hash a file reads as, without its content; None when it doesn't exist."""
    return (
        WorkspaceFile.objects.filter(workspace=workspace, path=normalize_path(path))
        .values_list("blob_id", flat=True)
        .first()
    )


def read(workspace, path):
    path = normalize_path(path)
    row = (
        WorkspaceFile.objects.select_related("blob").filter(workspace=workspace, path=path).first()
    )
    if row is None:
        return File(path, None, None)
    return File(path, bytes(row.blob.content), row.blob_id)


def contents(hashes):
    """The content of each blob hash. Blobs never change, so these can't be stale."""
    return {
        hash_: bytes(content)
        for hash_, content in Blob.objects.filter(hash__in=set(hashes)).values_list(
            "hash", "content"
        )
    }


@dataclass(frozen=True)
class Listing:
    """The files under a folder, mapped to their blob hashes.

    Pass `version` back to `commit` as the listing expected under this folder.
    """

    files: dict[str, str]
    version: str


def under(path, folder):
    """Whether `path` is inside `folder`, where "" is the whole workspace."""
    return not folder or path.startswith(f"{folder}/")


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
    files = _files_under(workspace, normalize_folder(folder))
    return Listing(files, listing_version(files))


def commit(workspace, author, message, changes, folders=None, continuing=False):
    """Apply `changes` as one new revision on top of the head, or, for a continuing commit such
    as a live document's save, add them to the open head (docs/specs/workspaces/store.md).

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
    folders = {normalize_folder(folder): version for folder, version in (folders or {}).items()}
    return _apply(workspace, author, message, prepared, folders, continuing)


@transaction.atomic
def _apply(workspace, author, message, prepared, folders, continuing):
    # Serializes commits per workspace: a row lock on PostgreSQL, and SQLite's IMMEDIATE
    # transactions already allow one writer at a time.
    locked = Workspace.objects.select_for_update().get(pk=workspace.pk)
    for folder, expected in folders.items():
        current = listing_version(_files_under(locked, folder))
        if current != expected:
            raise StaleFile(
                f"The files under {folder!r} changed since they were listed.",
                folder,
                current,
                folder=True,
            )
    current = dict(
        WorkspaceFile.objects.filter(workspace=locked, path__in=prepared).values_list(
            "path", "blob_id"
        )
    )
    writes, deletes, contents = {}, set(), {}
    for path, (expected, hash_, content) in prepared.items():
        existing = current.get(path)
        if existing != expected:
            raise StaleFile(f"{path!r} changed since it was read.", path, existing)
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
    now = timezone.now()
    head = locked.head
    paths = sorted(writes.keys() | deletes)
    replaced = set()
    if continuing and _takes_more(head, author, now):
        revision = head
        replaced = set(
            head.changes.filter(path__in=paths).exclude(blob=None).values_list("blob_id", flat=True)
        )
        head.changed_at = now
        head.save(update_fields=["changed_at"])
    else:
        if head is not None and not head.sealed:
            head.sealed = True
            head.save(update_fields=["sealed"])
        revision = Revision.objects.create(
            workspace=locked,
            parent_id=locked.head_id,
            author=author,
            message=message,
            changed_at=now,
            sealed=not continuing,
        )
    RevisionChange.objects.bulk_create(
        [RevisionChange(revision=revision, path=path, blob_id=writes.get(path)) for path in paths],
        update_conflicts=True,
        unique_fields=["revision", "path"],
        update_fields=["blob"],
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
    delete_unreferenced_blobs(replaced)
    return revision


def _takes_more(head, author, now):
    """Whether an open head takes a continuing commit's changes instead of being sealed."""
    return (
        head is not None
        and not head.sealed
        and head.author_id == (author.pk if author else None)
        and head.changed_at > now - CONTINUE_WITHIN
        and head.created_at > now - OPEN_AT_MOST
    )


def folders_of(path):
    segments = path.split("/")
    return ["/".join(segments[:depth]) for depth in range(1, len(segments))]


class Namespace:
    """Files and folders as a case-insensitive filesystem sees them."""

    def __init__(self, paths=()):
        self.files = {}
        self.folders = {}
        for path in paths:
            self.add(path)

    def conflict(self, path):
        """Why `path` can't be added beside the current files, or None."""
        key = path.casefold()
        if self.files.get(key) == path:
            return f"{path!r} already exists."
        if key in self.files:
            return f"Paths {self.files[key]!r} and {path!r} differ only by case."
        if key in self.folders:
            return f"{path!r} is a folder, so it can't also be a file."
        for folder in folders_of(path):
            folder_key = folder.casefold()
            if folder_key in self.files:
                return f"{self.files[folder_key]!r} is a file, so {path!r} can't be inside it."
            existing = self.folders.get(folder_key)
            if existing and existing[0] != folder:
                return f"Folder {folder!r} differs only by case from {existing[0]!r}."
        return None

    def file(self, path):
        """The file whose path equals `path` ignoring case, or None."""
        return self.files.get(path.casefold())

    def folder(self, path):
        """The folder whose path equals `path` ignoring case, or None."""
        existing = self.folders.get(path.casefold())
        return existing[0] if existing else None

    def is_folder(self, path):
        existing = self.folders.get(path.casefold())
        return existing is not None and existing[0] == path

    def add(self, path):
        self.files[path.casefold()] = path
        for folder in folders_of(path):
            self.folders.setdefault(folder.casefold(), [folder, 0])[1] += 1

    def remove(self, path):
        del self.files[path.casefold()]
        for folder in folders_of(path):
            existing = self.folders[folder.casefold()]
            existing[1] -= 1
            if not existing[1]:
                del self.folders[folder.casefold()]


def occupants(namespace, files, path):
    """The versions of what occupies `path` ignoring case, given `files` mapped to blob hashes."""
    versions = {}
    for key in [path, *folders_of(path)]:
        existing = namespace.file(key)
        if existing in files:
            versions[existing] = files[existing]
    folder = namespace.folder(path)
    if folder and any(under(stored, folder) for stored in files):
        versions[folder] = listing_version(
            {stored: hash_ for stored, hash_ in files.items() if under(stored, folder)}
        )
    return versions


def _check_namespace(workspace, added, deleted):
    """Reject added paths that a case-insensitive filesystem couldn't hold beside the rest."""
    files = dict(
        WorkspaceFile.objects.filter(workspace=workspace)
        .exclude(path__in=deleted)
        .values_list("path", "blob_id")
    )
    namespace = Namespace(files)
    for path in added:
        reason = namespace.conflict(path)
        if reason:
            raise PathTaken(reason, path, occupants(namespace, files, path))
        namespace.add(path)


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
    stored = contents(hash_ for hash_ in final.values() if hash_ is not None)
    return {path: stored[hash_] for path, hash_ in final.items() if hash_ is not None}
