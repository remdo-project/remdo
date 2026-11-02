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
    for number in [*"123456789", *"\u00b9\u00b2\u00b3"]
}
SEGMENT_MAX_BYTES = 255
WINDOWS_FORBIDDEN_CHARS = set('<>:"|?*\\')


@dataclass(frozen=True)
class File:
    """A file's content and content hash; both are None when the path doesn't exist.

    Pass `blob_hash` back to `commit` as the content expected for this path.
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
    if any(
        ord(char) < 0x20 or ord(char) == 0x7F or char in WINDOWS_FORBIDDEN_CHARS for char in path
    ):
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


def path_key(path):
    return hashlib.sha256(path.casefold().encode()).hexdigest()


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


@transaction.atomic
def commit(workspace, author, message, changes, expected):
    """Apply `changes` ({path: content bytes or None}) as one new revision on top of the head.

    `expected` maps every changed path to the blob hash the caller read, or None for a file
    the caller saw missing. Raises StaleFile, writing nothing, when any of them differs.
    """
    # Serializes commits per workspace: a row lock on PostgreSQL, and SQLite's IMMEDIATE
    # transactions already allow one writer at a time.
    locked = Workspace.objects.select_for_update().get(pk=workspace.pk)

    expected_hashes = {normalize_path(path): hash_ for path, hash_ in expected.items()}
    requested = {}
    for path, content in changes.items():
        path = normalize_path(path)
        if path in requested:
            raise InvalidPath(f"Path {path!r} appears twice.")
        if path not in expected_hashes:
            raise StaleFile(f"No expected content given for {path!r}.")
        requested[path] = None if content is None else (content, blob_hash(content))

    current = {
        row.path: row for row in WorkspaceFile.objects.filter(workspace=locked, path__in=requested)
    }
    for path in requested:
        existing, hash_ = current.get(path), expected_hashes[path]
        if (existing and existing.blob_id) != hash_:
            raise StaleFile(f"{path!r} changed since it was read.")

    effective = {}
    for path, value in requested.items():
        existing = current.get(path)
        if value is None:
            if existing is None:
                raise InvalidPath(f"Can't delete missing path {path!r}.")
            effective[path] = None
        elif existing is None or existing.blob_id != value[1]:
            effective[path] = value
    if not effective:
        raise NoChanges("The changes match the current files.")

    _check_namespace(locked, effective)

    # Sorted, so commits sharing new blobs insert them in the same order and can't deadlock.
    new_blobs = {hash_: content for content, hash_ in filter(None, effective.values())}
    Blob.objects.bulk_create(
        [Blob(hash=hash_, content=new_blobs[hash_]) for hash_ in sorted(new_blobs)],
        ignore_conflicts=True,
    )
    revision = Revision.objects.create(
        workspace=locked, parent_id=locked.head_id, author=author, message=message
    )
    RevisionChange.objects.bulk_create(
        [
            RevisionChange(revision=revision, path=path, blob_id=value and value[1])
            for path, value in effective.items()
        ]
    )
    deleted = [path for path, value in effective.items() if value is None]
    WorkspaceFile.objects.filter(workspace=locked, path__in=deleted).delete()
    for path, value in effective.items():
        if value is not None:
            WorkspaceFile.objects.update_or_create(
                workspace=locked,
                path=path,
                defaults={"blob_id": value[1], "path_key": path_key(path)},
            )

    # Keeps history a single line even if the lock above were ever weakened.
    if not Workspace.objects.filter(pk=locked.pk, head_id=locked.head_id).update(head=revision):
        raise StaleFile("Another commit landed during this one.")
    workspace.head = revision
    return revision


def _check_namespace(workspace, effective):
    """Reject a final file set that a case-insensitive filesystem couldn't hold."""
    paths = set(WorkspaceFile.objects.filter(workspace=workspace).values_list("path", flat=True))
    paths -= {path for path, value in effective.items() if value is None}
    paths |= {path for path, value in effective.items() if value is not None}
    folded = {}
    for path in paths:
        key = path.casefold()
        if key in folded:
            raise InvalidPath(f"Paths {folded[key]!r} and {path!r} differ only by case.")
        folded[key] = path
    for key, path in folded.items():
        segments = key.split("/")
        for depth in range(1, len(segments)):
            folder = "/".join(segments[:depth])
            if folder in folded:
                raise InvalidPath(f"{folded[folder]!r} is a file, so {path!r} can't be inside it.")


def files_at(revision):
    """Rebuild the files of any revision by replaying its ancestry in two queries."""
    parents = dict(
        Revision.objects.filter(workspace_id=revision.workspace_id).values_list("id", "parent_id")
    )
    chain = []
    node = revision.pk
    while node is not None:
        chain.append(node)
        node = parents[node]
    position = {revision_id: index for index, revision_id in enumerate(reversed(chain))}
    changes = sorted(
        (
            change
            for change in RevisionChange.objects.filter(
                revision__workspace_id=revision.workspace_id
            ).values_list("revision_id", "path", "blob_id", "blob__content")
            if change[0] in position
        ),
        key=lambda change: position[change[0]],
    )
    files = {}
    for _revision_id, path, blob_id, content in changes:
        if blob_id is None:
            files.pop(path, None)
        else:
            files[path] = bytes(content)
    return files
