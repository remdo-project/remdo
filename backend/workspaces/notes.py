"""Note operations on a workspace's folders, documents and plain files.

Outline notes, Markdown blocks and Ensure ID arrive with the text format parser.
"""

import base64
import difflib
import re

from django.db import transaction

from . import store
from .models import WORKSPACE_NAME_MAX_LENGTH, Workspace

PERSONAL_WORKSPACE_NAME = "Personal"
DOCUMENT_SUFFIX = ".md"
OPERATIONS = {
    "workspace": ["read", "insert", "setText"],
    "folder": ["read", "insert", "move", "delete", "setText"],
    "document": ["read", "move", "delete", "setText", "setContent"],
    "file": ["read", "move", "delete", "setText", "setContent"],
}
# The text format's ID note, as in `- id:: k3x9`; the format parser replaces this.
ID_NOTE = re.compile(r"^[ \t>]*[-*+][ \t]+id::[ \t]*(\S+)[ \t]*$", re.MULTILINE)


class Refusal(Exception):
    def __init__(self, code, message, index=None, versions=None):
        super().__init__(message)
        self.code = code
        self.index = index
        self.versions = versions or {}


def workspaces_of(user):
    """The user's workspaces, creating their personal workspace on first use."""
    with transaction.atomic():
        type(user).objects.select_for_update().filter(pk=user.pk).first()
        workspaces = list(Workspace.objects.filter(owner=user))
        if not workspaces:
            workspaces = [Workspace.objects.create(name=PERSONAL_WORKSPACE_NAME, owner=user)]
    return workspaces


def workspace_of(user, workspace_id):
    workspace = Workspace.objects.filter(owner=user, pk=workspace_id).first()
    if workspace is None:
        raise Refusal("NOT_FOUND", "The workspace is not available. Check list_workspaces.")
    return workspace


def decode(content):
    try:
        return {"content": content.decode(), "contentEncoding": "utf8"}
    except UnicodeDecodeError:
        return {"content": base64.b64encode(content).decode(), "contentEncoding": "base64"}


def ids_in(content):
    try:
        return ID_NOTE.findall(content.decode())
    except UnicodeDecodeError:
        return []


def document_has_children(content):
    try:
        text = content.decode()
    except UnicodeDecodeError:
        return bool(content)
    return bool(ID_NOTE.sub("", text).strip())


def _name(path):
    return path.rsplit("/", 1)[-1]


def _join(folder, name):
    return f"{folder}/{name}" if folder else name


def _parent(path):
    return path.rsplit("/", 1)[0] if "/" in path else ""


def _under(path, folder):
    return not folder or path.startswith(f"{folder}/")


class Tree:
    """A workspace's files as a call changes them, before anything is committed."""

    def __init__(self, workspace):
        self.workspace = workspace
        self.initial = store.list_paths(workspace).files
        self.files = dict(self.initial)
        self.contents = {}

    def kind(self, path):
        if path == "":
            return "workspace"
        if path in self.files:
            return "document" if path.endswith(DOCUMENT_SUFFIX) else "file"
        if any(_under(other, path) for other in self.files):
            return "folder"
        return None

    def under(self, folder):
        return sorted(path for path in self.files if _under(path, folder))

    def initial_version(self, folder):
        return store.listing_version(
            {path: hash_ for path, hash_ in self.initial.items() if _under(path, folder)}
        )

    def children(self, folder):
        names = {}
        for path in self.under(folder):
            rest = path[len(folder) + 1 :] if folder else path
            name, _, deeper = rest.partition("/")
            child = _join(folder, name)
            names[name] = child if not deeper else names.get(name, child)
        return [names[name] for name in sorted(names)]

    def content(self, path):
        hash_ = self.files[path]
        if hash_ not in self.contents:
            origin = next(p for p, h in self.initial.items() if h == hash_)
            file = store.read(self.workspace, origin)
            if file.blob_hash != hash_:
                raise Refusal(
                    "FAILED_PRECONDITION",
                    f"{origin!r} changed during the call.",
                    versions={"files": {origin: file.blob_hash}},
                )
            self.contents[hash_] = file.content
        return self.contents[hash_]

    def put(self, path, content):
        hash_ = store.blob_hash(content)
        self.contents[hash_] = content
        self.files[path] = hash_

    def taken(self, path):
        """Why `path` can't be added beside the current files, or None."""
        key = path.casefold()
        folders = {}
        for other in self.files:
            if other.casefold() == key:
                return f"{other!r} is already taken."
            segments = other.split("/")
            for depth in range(1, len(segments)):
                folder = "/".join(segments[:depth])
                folders.setdefault(folder.casefold(), folder)
        if key in folders:
            return f"{folders[key]!r} is a folder."
        segments = path.split("/")
        for depth in range(1, len(segments)):
            folder = "/".join(segments[:depth])
            if folder.casefold() in {other.casefold() for other in self.files}:
                return f"{folder!r} is a file."
            if folders.get(folder.casefold(), folder) != folder:
                return (
                    f"Folder {folder!r} differs only by case from {folders[folder.casefold()]!r}."
                )
        return None


def text_of(workspace, path, kind):
    if kind == "workspace":
        return workspace.name
    name = _name(path)
    return name[: -len(DOCUMENT_SUFFIX)] if kind == "document" else name


def read(workspace, path="", depth=1, content=False):
    path = store.normalize_path(path) if path else ""
    tree = Tree(workspace)
    if tree.kind(path) is None:
        raise Refusal("NOT_FOUND", f"No note at {path!r}.")
    node = _read_node(workspace, tree, path, depth)
    if content and node["kind"] in ("document", "file"):
        node.update(decode(tree.content(path)))
    return node


def _read_node(workspace, tree, path, depth):
    kind = tree.kind(path)
    node = {
        "ref": {"path": path},
        "kind": kind,
        "text": text_of(workspace, path, kind),
        "operations": OPERATIONS[kind],
    }
    if kind in ("workspace", "folder"):
        node["version"] = tree.initial_version(path)
        children = tree.children(path)
        if depth > 0:
            node["children"] = [_read_node(workspace, tree, child, depth - 1) for child in children]
        else:
            node["hasChildren"] = bool(children)
    else:
        node["version"] = tree.files[path]
        node["hasChildren"] = kind == "document" and document_has_children(tree.content(path))
    return node


class Call:
    def __init__(self, workspace, expected):
        self.workspace = workspace
        self.tree = Tree(workspace)
        self.expected_files = self.normalized(expected.get("files", {}))
        self.expected_folders = self.normalized(expected.get("folders", {}))
        self.used_folders = {}
        self.vouched = set()
        self.first_use = {}
        self.name = workspace.name
        self.index = 0

    def normalized(self, versions):
        try:
            return {
                store.normalize_path(path) if path else "": version
                for path, version in versions.items()
            }
        except store.InvalidPath as error:
            raise Refusal("INVALID_ARGUMENT", f"expected: {error}") from error

    def refuse(self, code, message, versions=None):
        raise Refusal(code, message, self.index, versions)

    def path(self, ref, field="target"):
        path = (ref or {}).get("path", "")
        try:
            return store.normalize_path(path) if path else ""
        except store.InvalidPath as error:
            self.refuse("INVALID_ARGUMENT", f"{field}: {error}")

    def note(self, ref, field="target", kinds=None):
        path = self.path(ref, field)
        kind = self.tree.kind(path)
        if kind is None:
            self.refuse("NOT_FOUND", f"{field}: no note at {path!r}.")
        if kinds and kind not in kinds:
            self.refuse("INVALID_ARGUMENT", f"{field}: a {kind} doesn't offer this operation.")
        return path, kind

    def vouch(self, path, kind):
        """Check the caller read what this operation changes, as it is now."""
        paths = [path] if kind in ("document", "file") else self.tree.under(path)
        for file in paths:
            if file in self.vouched:
                continue
            if file in self.expected_files and file in self.tree.initial:
                expected = self.expected_files[file]
                if expected != self.tree.initial[file]:
                    self.refuse(
                        "FAILED_PRECONDITION",
                        f"{file!r} changed since it was read.",
                        {"files": {file: self.tree.initial[file]}},
                    )
                self.use(file)
                continue
            folder = next(
                (
                    folder
                    for folder in self.expected_folders
                    if _under(file, folder) and file in self.tree.initial
                ),
                None,
            )
            if folder is None:
                self.refuse(
                    "INVALID_ARGUMENT",
                    f"State the version of {file!r}, or of a folder holding it, as read.",
                )
            current = self.tree.initial_version(folder)
            if self.expected_folders[folder] != current:
                self.refuse(
                    "FAILED_PRECONDITION",
                    f"The files under {folder!r} changed since they were read.",
                    {"folders": {folder: current}},
                )
            self.used_folders[folder] = current
            for initial in self.tree.initial:
                if _under(initial, folder):
                    self.use(initial)

    def use(self, path):
        self.vouched.add(path)
        self.first_use.setdefault(path, self.index)

    def produce(self, path):
        reason = self.tree.taken(path)
        if reason:
            self.refuse("FAILED_PRECONDITION", f"Can't place {path!r}: {reason}")
        self.vouched.add(path)
        self.first_use.setdefault(path, self.index)

    def relocate(self, path, kind, new_path):
        moving = [path] if kind in ("document", "file") else self.tree.under(path)
        moved = {old: new_path + old[len(path) :] for old in moving}
        hashes = {old: self.tree.files.pop(old) for old in moving}
        for old, new in moved.items():
            self.path({"path": new}, "text")
            self.produce(new)
            self.tree.files[new] = hashes[old]

    def apply(self, operation):
        op = operation["op"]
        if op == "insert":
            return self.insert(operation)
        if op == "move":
            return self.move(operation)
        if op == "delete":
            return self.delete(operation)
        if op == "setText":
            return self.set_text(operation)
        return self.set_content(operation)

    def content_argument(self, operation):
        if "content" not in operation:
            return b""
        value = operation["content"]
        if operation.get("contentEncoding") == "base64":
            try:
                return base64.b64decode(value, validate=True)
            except ValueError:
                self.refuse("INVALID_ARGUMENT", "content is not valid base64.")
        return value.encode()

    def insert(self, operation):
        parent, _ = self.note(operation.get("parent"), "parent", ("workspace", "folder"))
        kind = operation["kind"]
        name = self.file_name(operation["text"], kind)
        path = self.path({"path": _join(parent, name)}, "text")
        content = self.content_argument(operation)
        if kind == "document" and ids_in(content):
            self.refuse("INVALID_ARGUMENT", "content: a new document can't carry IDs.")
        self.produce(path)
        self.put_checked(path, content)
        return {"ref": {"path": path}, "kind": kind}

    def file_name(self, text, kind):
        if not text or "/" in text:
            self.refuse("INVALID_ARGUMENT", "text: a name is non-empty and has no '/'.")
        name = text + DOCUMENT_SUFFIX if kind == "document" else text
        if kind == "file" and name.endswith(DOCUMENT_SUFFIX):
            self.refuse("INVALID_ARGUMENT", "text: a file named *.md would be a document.")
        return name

    def put_checked(self, path, content):
        try:
            self.tree.put(path, content)
        except store.InvalidContent as error:
            self.refuse("INVALID_ARGUMENT", f"content: {error}")

    def move(self, operation):
        path, kind = self.note(operation.get("target"), kinds=("folder", "document", "file"))
        parent, _ = self.note(operation.get("parent"), "parent", ("workspace", "folder"))
        if parent == path or (parent and _under(parent, path)):
            self.refuse("INVALID_ARGUMENT", "parent: a folder can't move into itself.")
        new_path = _join(parent, _name(path))
        if new_path != path:
            self.vouch(path, kind)
            self.relocate(path, kind, new_path)
        return {"ref": {"path": new_path}}

    def delete(self, operation):
        path, kind = self.note(operation.get("target"), kinds=("folder", "document", "file"))
        self.vouch(path, kind)
        files = [path] if kind in ("document", "file") else self.tree.under(path)
        has_children = kind == "folder" or (
            kind == "document" and document_has_children(self.tree.content(path))
        )
        if has_children and not operation.get("withChildren"):
            self.refuse(
                "INVALID_ARGUMENT", f"{path!r} has children; set withChildren to delete them too."
            )
        removed = []
        for file in files:
            if file.endswith(DOCUMENT_SUFFIX):
                removed += ids_in(self.tree.content(file))
            del self.tree.files[file]
        return {"removedIds": removed}

    def replaced(self, value, operation, field):
        if "replacements" not in operation:
            new = operation.get(field)
            if new is None:
                self.refuse("INVALID_ARGUMENT", f"Give {field} or replacements.")
            return new
        for number, replacement in enumerate(operation["replacements"]):
            count = value.count(replacement["old"]) if replacement["old"] else 0
            if count != 1:
                self.refuse(
                    "INVALID_ARGUMENT",
                    f"replacements.{number}: the old text matches {count} times, not once.",
                )
            value = value.replace(replacement["old"], replacement["new"])
        return value

    def set_text(self, operation):
        path, kind = self.note(
            operation.get("target"), kinds=("workspace", "folder", "document", "file")
        )
        current = text_of(self.workspace, path, kind) if kind != "workspace" else self.name
        text = self.replaced(current, operation, "text")
        if text == current:
            self.refuse("INVALID_ARGUMENT", "The text is unchanged.")
        if kind == "workspace":
            if not text.strip() or len(text) > WORKSPACE_NAME_MAX_LENGTH:
                self.refuse(
                    "INVALID_ARGUMENT",
                    f"A workspace name has 1 to {WORKSPACE_NAME_MAX_LENGTH} characters.",
                )
            self.name = text
            return {"ref": {"path": ""}}
        name = self.file_name(text, kind)
        new_path = self.path({"path": _join(_parent(path), name)}, "text")
        self.vouch(path, kind)
        self.relocate(path, kind, new_path)
        return {"ref": {"path": new_path}}

    def set_content(self, operation):
        path, kind = self.note(operation.get("target"), kinds=("document", "file"))
        self.vouch(path, kind)
        current = self.tree.content(path)
        if "replacements" in operation:
            try:
                text = current.decode()
            except UnicodeDecodeError:
                self.refuse("INVALID_ARGUMENT", "Replacements apply only to text.")
            content = self.replaced(text, operation, "content").encode()
        else:
            content = self.content_argument(operation)
        if content == current:
            self.refuse("INVALID_ARGUMENT", "The content is unchanged.")
        if kind == "document" and sorted(ids_in(content)) != sorted(ids_in(current)):
            self.refuse("INVALID_ARGUMENT", "content: Set content can't add or remove IDs.")
        self.put_checked(path, content)
        return {"ref": {"path": path}}

    def changes(self):
        tree = self.tree
        changes = {}
        for path in sorted(tree.initial.keys() | tree.files.keys()):
            before, after = tree.initial.get(path), tree.files.get(path)
            if before != after:
                changes[path] = (before, None if after is None else tree.content(path))
        return changes


def change(workspace, author, operations, expected=None, dry_run=False):
    """Apply `operations` as one call: all of them as one commit, or none."""
    call = Call(workspace, expected or {})
    results = []
    for index, operation in enumerate(operations):
        call.index = index
        results.append(call.apply(operation))
    call.index = None
    changes = call.changes()
    before = {path: call.tree.initial.get(path) for path in changes}
    with transaction.atomic():
        if call.name != workspace.name:
            Workspace.objects.filter(pk=workspace.pk).update(name=call.name)
        revision = None
        if changes:
            try:
                revision = store.commit(
                    workspace, author, _message(operations), changes, folders=call.used_folders
                )
            except store.StaleFile as error:
                versions = (
                    {"folders": {error.path: store.list_paths(workspace, error.path).version}}
                    if error.path in call.used_folders
                    else {"files": {error.path: store.read(workspace, error.path).blob_hash}}
                )
                raise Refusal(
                    "FAILED_PRECONDITION", str(error), call.first_use.get(error.path), versions
                ) from error
            except store.StoreError as error:
                raise Refusal("INVALID_ARGUMENT", str(error)) from error
        if dry_run:
            transaction.set_rollback(True)
    if dry_run:
        workspace.refresh_from_db(fields=["head"])
    else:
        workspace.name = call.name
    return {
        "results": results,
        "changes": [
            _describe(path, before[path], content, call, dry_run)
            for path, (_, content) in changes.items()
        ],
        "revision": None if dry_run or revision is None else revision.pk,
        "dryRun": dry_run,
    }


def _describe(path, before, content, call, dry_run):
    after = None if content is None else store.blob_hash(content)
    description = {
        "ref": {"path": path},
        "change": "added" if before is None else "deleted" if after is None else "changed",
        "version": after,
    }
    if dry_run and before is not None and content is not None:
        old, new = call.tree.contents.get(before), content
        if old is None:
            old = store.read(call.workspace, path).content
        try:
            description["diff"] = "".join(
                difflib.unified_diff(
                    old.decode().splitlines(keepends=True),
                    new.decode().splitlines(keepends=True),
                    path,
                    path,
                )
            )
        except UnicodeDecodeError:
            pass
    return description


def _message(operations):
    return ", ".join(operation["op"] for operation in operations)
