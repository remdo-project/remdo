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
REQUIRED_FIELDS = {
    "insert": ("kind", "text"),
    "move": ("target", "parent"),
    "delete": ("target",),
    "setText": ("target",),
    "setContent": ("target",),
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
    workspaces = list(Workspace.objects.filter(owner=user))
    if workspaces:
        return workspaces
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
        self.namespace = store.Namespace(self.initial)
        self.contents = {}

    def kind(self, path):
        if path == "":
            return "workspace"
        if path in self.files:
            return "document" if path.endswith(DOCUMENT_SUFFIX) else "file"
        return "folder" if self.namespace.is_folder(path) else None

    def files_of(self, path, kind):
        if kind in ("document", "file"):
            return [path]
        return sorted(file for file in self.files if _under(file, path))

    def has_children(self, path, kind):
        if kind in ("workspace", "folder"):
            return bool(self.files_of(path, kind))
        return kind == "document" and document_has_children(self.content(path))

    def initial_version(self, folder):
        return store.listing_version(
            {path: hash_ for path, hash_ in self.initial.items() if _under(path, folder)}
        )

    def children(self, folder):
        start = len(folder) + 1 if folder else 0
        return sorted(
            {
                _join(folder, path[start:].partition("/")[0])
                for path in self.files_of(folder, "folder")
            }
        )

    def load(self, paths):
        missing = {self.files[path] for path in paths} - self.contents.keys()
        if missing:
            self.contents.update(store.contents(missing))

    def content(self, path):
        self.load([path])
        return self.contents[self.files[path]]

    def put(self, path, content):
        hash_ = store.blob_hash(content)
        self.contents[hash_] = content
        if path not in self.files:
            self.namespace.add(path)
        self.files[path] = hash_

    def remove(self, path):
        self.namespace.remove(path)
        return self.files.pop(path)


def text_of(workspace, path, kind):
    if kind == "workspace":
        return workspace.name
    name = _name(path)
    return name[: -len(DOCUMENT_SUFFIX)] if kind == "document" else name


def read(workspace, path="", depth=1, content=False):
    try:
        path = store.normalize_folder(path)
    except store.InvalidPath as error:
        raise Refusal("INVALID_ARGUMENT", f"ref: {error}") from error
    tree = Tree(workspace)
    kind = tree.kind(path)
    if kind is None:
        raise Refusal("NOT_FOUND", f"No note at {path!r}.")
    documents = []
    node = _read_node(workspace, tree, path, kind, depth, documents)
    tree.load(path for path, _ in documents)
    for path, document in documents:
        document["hasChildren"] = tree.has_children(path, "document")
    if content and kind in ("document", "file"):
        node.update(decode(tree.content(path)))
    return node


def _read_node(workspace, tree, path, kind, depth, documents):
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
            node["children"] = [
                _read_node(workspace, tree, child, tree.kind(child), depth - 1, documents)
                for child in children
            ]
        else:
            node["hasChildren"] = bool(children)
    else:
        node["version"] = tree.files[path]
        node["hasChildren"] = False
        if kind == "document":
            documents.append((path, node))
    return node


class Call:
    def __init__(self, workspace, expected):
        self.workspace = workspace
        self.tree = Tree(workspace)
        self.expected_files = self.normalized(expected.get("files", {}))
        self.expected_folders = self.normalized(expected.get("folders", {}))
        self.used_folders = {}
        self.first_use = {}
        self.name = workspace.name
        self.index = 0

    def normalized(self, versions):
        try:
            return {store.normalize_folder(path): version for path, version in versions.items()}
        except store.InvalidPath as error:
            raise Refusal("INVALID_ARGUMENT", f"expected: {error}") from error

    def refuse(self, code, message, versions=None):
        raise Refusal(code, message, self.index, versions)

    def path(self, path, field):
        try:
            return store.normalize_folder(path)
        except store.InvalidPath as error:
            self.refuse("INVALID_ARGUMENT", f"{field}: {error}")

    def note(self, ref, field="target", kinds=None):
        path = self.path((ref or {}).get("path", ""), field)
        kind = self.tree.kind(path)
        if kind is None:
            self.refuse("NOT_FOUND", f"{field}: no note at {path!r}.")
        if kinds and kind not in kinds:
            self.refuse("INVALID_ARGUMENT", f"{field}: a {kind} doesn't offer this operation.")
        return path, kind

    def vouch(self, path, kind):
        """Check the caller read what this operation changes, as it is now."""
        for file in self.tree.files_of(path, kind):
            if file in self.first_use:
                continue
            if file in self.expected_files and file in self.tree.initial:
                if self.expected_files[file] != self.tree.initial[file]:
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
        self.first_use.setdefault(path, self.index)

    def produce(self, path):
        reason = self.tree.namespace.conflict(path)
        if reason:
            self.refuse("FAILED_PRECONDITION", f"Can't place {path!r}: {reason}")
        self.use(path)

    def relocate(self, path, kind, new_path):
        moving = self.tree.files_of(path, kind)
        hashes = {old: self.tree.remove(old) for old in moving}
        for old in moving:
            new = self.path(new_path + old[len(path) :], "text")
            self.produce(new)
            self.tree.files[new] = hashes[old]
            self.tree.namespace.add(new)

    def apply(self, operation):
        op = operation["op"]
        missing = [field for field in REQUIRED_FIELDS[op] if field not in operation]
        if missing:
            self.refuse("INVALID_ARGUMENT", f"{op} needs {', '.join(missing)}.")
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
        path = self.path(_join(parent, self.file_name(operation["text"], kind)), "text")
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
        files = self.tree.files_of(path, kind)
        self.tree.load(file for file in files if file.endswith(DOCUMENT_SUFFIX))
        if self.tree.has_children(path, kind) and not operation.get("withChildren"):
            self.refuse(
                "INVALID_ARGUMENT", f"{path!r} has children; set withChildren to delete them too."
            )
        removed = []
        for file in files:
            if file.endswith(DOCUMENT_SUFFIX):
                removed += ids_in(self.tree.content(file))
            self.tree.remove(file)
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
        path, kind = self.note(operation.get("target"))
        current = self.name if kind == "workspace" else text_of(self.workspace, path, kind)
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
        new_path = self.path(_join(_parent(path), self.file_name(text, kind)), "text")
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
        changed = [
            path
            for path in sorted(tree.initial.keys() | tree.files.keys())
            if tree.initial.get(path) != tree.files.get(path)
        ]
        tree.load(path for path in changed if path in tree.files)
        return {
            path: (tree.initial.get(path), tree.content(path) if path in tree.files else None)
            for path in changed
        }


def change(workspace, author, operations, expected=None, dry_run=False):
    """Apply `operations` as one call: all of them as one commit, or none."""
    call = Call(workspace, expected or {})
    results = []
    for index, operation in enumerate(operations):
        call.index = index
        results.append(call.apply(operation))
    changes = call.changes()
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
                raise Refusal(
                    "FAILED_PRECONDITION",
                    str(error),
                    call.first_use.get(error.path),
                    {"folders" if error.folder else "files": {error.path: error.current}},
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
            _describe(path, before, content, call.tree, dry_run)
            for path, (before, content) in changes.items()
        ],
        "revision": None if revision is None or dry_run else revision.pk,
        "dryRun": dry_run,
    }


def _describe(path, before, content, tree, dry_run):
    after = None if content is None else store.blob_hash(content)
    description = {
        "ref": {"path": path},
        "change": "added" if before is None else "deleted" if after is None else "changed",
        "version": after,
    }
    if dry_run and before is not None and content is not None:
        old = tree.contents.get(before) or store.contents([before])[before]
        try:
            description["diff"] = "".join(
                difflib.unified_diff(
                    old.decode().splitlines(keepends=True),
                    content.decode().splitlines(keepends=True),
                    path,
                    path,
                )
            )
        except UnicodeDecodeError:
            pass
    return description


def _message(operations):
    return ", ".join(operation["op"] for operation in operations)
