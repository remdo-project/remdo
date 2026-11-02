"""Workspace text and history: the only module that writes workspace files."""

import hashlib
import unicodedata
from dataclasses import dataclass

from django.db import transaction

from .models import PATH_MAX_LENGTH, Blob, Revision, RevisionChange, Workspace, WorkspaceFile


class StoreError(ValueError):
    pass


class StaleBase(StoreError):
    """The caller's base revision is no longer the workspace head."""


class NoChanges(StoreError):
    pass


class InvalidPath(StoreError):
    pass


class InvalidText(StoreError):
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
    """A file as of `base`; `text` and `blob_hash` are None when the path doesn't exist."""

    path: str
    base: int | None
    text: str | None
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


def blob_hash(text):
    if not isinstance(text, str) or "\x00" in text:
        raise InvalidText("Text must be a string without NUL characters.")
    try:
        data = text.encode()
    except UnicodeEncodeError as error:
        raise InvalidText("Text must be valid Unicode.") from error
    return hashlib.sha256(data).hexdigest()


def read(workspace, path):
    """Read a file with the head to pass as `base` when committing a change to it."""
    path = normalize_path(path)
    # Head first: if a commit lands between the two queries, the file is newer than `base`,
    # so a commit based on it fails as stale instead of overwriting.
    base = Workspace.objects.filter(pk=workspace.pk).values_list("head_id", flat=True).get()
    row = (
        WorkspaceFile.objects.select_related("blob").filter(workspace=workspace, path=path).first()
    )
    if row is None:
        return File(path, base, None, None)
    return File(path, base, row.blob.text, row.blob_id)


def list_paths(workspace):
    return list(
        WorkspaceFile.objects.filter(workspace=workspace)
        .order_by("path")
        .values_list("path", flat=True)
    )


@transaction.atomic
def commit(workspace, author, message, changes, base):
    """Apply `changes` ({path: text or None}) on top of `base` as one new revision.

    Raises StaleBase, writing nothing, when `base` is not the current head.
    """
    locked = Workspace.objects.select_for_update().get(pk=workspace.pk)
    base_id = base.pk if isinstance(base, Revision) else base
    if locked.head_id != base_id:
        raise StaleBase(f"Base {base_id} is not head {locked.head_id}.")

    requested = {}
    for path, text in changes.items():
        path = normalize_path(path)
        if path in requested:
            raise InvalidPath(f"Path {path!r} appears twice.")
        requested[path] = None if text is None else (text, blob_hash(text))

    current = {
        row.path: row for row in WorkspaceFile.objects.filter(workspace=locked, path__in=requested)
    }
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
    new_blobs = {hash_: text for text, hash_ in filter(None, effective.values())}
    Blob.objects.bulk_create(
        [Blob(hash=hash_, text=new_blobs[hash_]) for hash_ in sorted(new_blobs)],
        ignore_conflicts=True,
    )
    revision = Revision.objects.create(
        workspace=locked, parent_id=base_id, author=author, message=message
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

    # The conditional update is the compare-and-set; the row lock above only avoids wasted work.
    if not Workspace.objects.filter(pk=locked.pk, head_id=base_id).update(head=revision):
        raise StaleBase(f"Base {base_id} changed during the commit.")
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
            ).values_list("revision_id", "path", "blob_id", "blob__text")
            if change[0] in position
        ),
        key=lambda change: position[change[0]],
    )
    files = {}
    for _revision_id, path, blob_id, text in changes:
        if blob_id is None:
            files.pop(path, None)
        else:
            files[path] = text
    return files
