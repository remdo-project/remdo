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
    """A file changed since the caller read it."""


class NoChanges(StoreError):
    pass


class InvalidPath(StoreError):
    pass


class InvalidContent(StoreError):
    pass


WINDOWS_RESERVED_NAMES = {"con", "prn", "aux", "nul"} | {
    f"{device}{number}"
    for device in ("com", "lpt")
    for number in [*"0123456789", *"\u00b9\u00b2\u00b3"]
}
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
    if not path or len(path) > PATH_MAX_LENGTH:
        raise InvalidPath(f"Path must have 1 to {PATH_MAX_LENGTH} characters.")
    if any(unicodedata.category(char) == "Cs" for char in path):
        raise InvalidPath("Path must be valid Unicode text.")
    if any(unicodedata.category(char) == "Cc" or char in WINDOWS_FORBIDDEN_CHARS for char in path):
        raise InvalidPath("Path can't contain control characters or any of <>:\"|?*\\.")
    for segment in path.split("/"):
        if segment in ("", ".", ".."):
            raise InvalidPath("Path must be relative, with no empty, '.' or '..' segments.")
        if len(segment.encode()) > SEGMENT_MAX_BYTES:
            raise InvalidPath(f"Path segment {segment[:40]!r}... is longer than filesystems allow.")
        # Windows can't check out these names, so a clone there would fail.
        if segment[-1] in ". " or segment.split(".")[0].casefold() in WINDOWS_RESERVED_NAMES:
            raise InvalidPath(f"Path segment {segment!r} isn't valid on Windows.")
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


def list_paths(workspace):
    return list(
        WorkspaceFile.objects.filter(workspace=workspace)
        .order_by("path")
        .values_list("path", flat=True)
    )


def commit(workspace, author, message, changes):
    """Apply `changes` as one new revision on top of the head.

    `changes` maps each path to `(expected, content)`: `expected` is the blob hash the caller
    read, or None for a file it saw missing, and `content` is the new bytes, or None to delete
    the file. Raises StaleFile, writing nothing, when any of those files differs from `expected`.
    """
    prepared = {}
    for path, (expected, content) in changes.items():
        path = normalize_path(path)
        if path in prepared:
            raise InvalidPath(f"Path {path!r} appears twice.")
        prepared[path] = (expected, None if content is None else blob_hash(content), content)
    return _apply(workspace, author, message, prepared)


@transaction.atomic
def _apply(workspace, author, message, prepared):
    # Serializes commits per workspace: a row lock on PostgreSQL, and SQLite's IMMEDIATE
    # transactions already allow one writer at a time.
    locked = Workspace.objects.select_for_update().get(pk=workspace.pk)
    current = dict(
        WorkspaceFile.objects.filter(workspace=locked, path__in=prepared).values_list(
            "path", "blob_id"
        )
    )
    writes, deletes, contents = {}, set(), {}
    for path, (expected, hash_, content) in prepared.items():
        existing = current.get(path)
        if existing != expected:
            raise StaleFile(f"{path!r} changed since it was read.")
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


def _folders(folded_path):
    segments = folded_path.split("/")
    return ["/".join(segments[:depth]) for depth in range(1, len(segments))]


def _check_namespace(workspace, added, deleted):
    """Reject added paths that a case-insensitive filesystem couldn't hold beside the rest."""
    files = {
        path.casefold(): path
        for path in WorkspaceFile.objects.filter(workspace=workspace)
        .exclude(path__in=deleted)
        .values_list("path", flat=True)
    }
    folders = {folder for key in files for folder in _folders(key)}
    for path in added:
        key = path.casefold()
        if key in files:
            raise InvalidPath(f"Paths {files[key]!r} and {path!r} differ only by case.")
        if key in folders:
            raise InvalidPath(f"{path!r} is a folder, so it can't also be a file.")
        for folder in _folders(key):
            if folder in files:
                raise InvalidPath(f"{files[folder]!r} is a file, so {path!r} can't be inside it.")
        files[key] = path
        folders.update(_folders(key))


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
