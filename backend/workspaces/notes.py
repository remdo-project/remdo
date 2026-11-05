"""Note operations on a workspace's folders, documents and plain files, one class per kind.

Outline notes, Markdown blocks and Ensure ID arrive with the text format parser.
"""

import base64
import difflib
import re

from django.db import transaction

from . import models, store
from .models import WORKSPACE_NAME_MAX_LENGTH

PERSONAL_WORKSPACE_NAME = "Personal"
DOCUMENT_SUFFIX = ".md"
REQUIRED_FIELDS = {
    "insert": ("kind", "text"),
    "move": ("target", "parent"),
    "delete": ("target",),
    "setText": ("target",),
    "setContent": ("target",),
}
# The text format's ID note, as in `- id:: k3x9`; the format parser replaces this.
ID_NOTE = re.compile(r"^[ \t>]*[-*+][ \t]+id::[ \t]*(\S+)[ \t]*\r?$", re.MULTILINE)


class Refusal(Exception):
    def __init__(self, code, message, index=None, versions=None):
        super().__init__(message)
        self.code = code
        self.index = index
        self.versions = versions or {}


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

    def initial_version(self, folder):
        return store.listing_version(
            {path: hash_ for path, hash_ in self.initial.items() if _under(path, folder)}
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

    def add(self, path, hash_):
        self.namespace.add(path)
        self.files[path] = hash_

    def remove(self, path):
        self.namespace.remove(path)
        return self.files.pop(path)

    def occupants(self, path):
        """The stored versions of what occupies `path`, ignoring case."""
        files = {}
        for key in [path, *store.folders_of(path)]:
            existing = self.namespace.files.get(key.casefold())
            if existing in self.initial:
                files[existing] = self.initial[existing]
        folder = self.namespace.folders.get(path.casefold())
        versions = {"files": files} if files else {}
        if folder and any(_under(stored, folder[0]) for stored in self.initial):
            versions["folders"] = {folder[0]: self.initial_version(folder[0])}
        return versions

    def changes(self):
        """Each changed path's stored version and new content, None when deleted."""
        changed = [
            path
            for path in sorted(self.initial.keys() | self.files.keys())
            if self.initial.get(path) != self.files.get(path)
        ]
        self.load(path for path in changed if path in self.files)
        return {
            path: (self.initial.get(path), self.content(path) if path in self.files else None)
            for path in changed
        }


def read(user, ref=None, depth=1, content=False):
    """Read the note `ref` names, starting from the user's account root."""
    ref = ref or {}
    account = Account(user)
    if ref.get("workspace") is None:
        if ref.get("path"):
            raise Refusal("INVALID_ARGUMENT", "ref: a path needs its workspace.")
        return account.read(depth)
    note = Call(account.workspace(ref["workspace"]), {}).note(ref, "ref")
    node = note.read(depth)
    if content and isinstance(note, File):
        node.update(decode(note.content))
    return node


def call(user, operations, expected=None, dry_run=False):
    """Apply `operations` all or none, on one workspace or on the user's account root."""
    account = Account(user)
    scopes = set()
    for index, operation in enumerate(operations):
        refs = [operation.get(field) or {} for field in ("target", "parent") if field in operation]
        workspaces = {ref.get("workspace") for ref in refs or [{}]}
        if len(workspaces) > 1:
            raise Refusal("INVALID_ARGUMENT", "A note can't move between workspaces.", index)
        scopes |= workspaces
    if len(scopes) > 1:
        raise Refusal(
            "INVALID_ARGUMENT", "A call changes the notes of one workspace, or the account root."
        )
    [scope] = scopes
    if scope is None:
        return account.call(operations, dry_run)
    return change(account.workspace(scope), user, operations, expected, dry_run)


def workspace_name(text, index=None):
    try:
        text.encode()
    except UnicodeEncodeError as error:
        raise Refusal("INVALID_ARGUMENT", "text: the text isn't valid Unicode.", index) from error
    if not text.strip() or len(text) > WORKSPACE_NAME_MAX_LENGTH:
        raise Refusal(
            "INVALID_ARGUMENT",
            f"A workspace name has 1 to {WORKSPACE_NAME_MAX_LENGTH} characters.",
            index,
        )
    return text


class Account:
    """The account root: its children are the account's workspaces, and it creates new ones."""

    kind = "account"
    operations = ("read", "insert")

    def __init__(self, user):
        self.user = user

    def workspaces(self):
        """The account's workspaces by name, creating its personal workspace on first use."""
        workspaces = models.Workspace.objects.filter(owner=self.user).order_by("name", "id")
        if not workspaces.exists():
            with transaction.atomic():
                type(self.user).objects.select_for_update().filter(pk=self.user.pk).first()
                if not workspaces.exists():
                    models.Workspace.objects.create(name=PERSONAL_WORKSPACE_NAME, owner=self.user)
        return list(workspaces)

    def workspace(self, workspace_id):
        workspace = models.Workspace.objects.filter(owner=self.user, pk=workspace_id).first()
        if workspace is None:
            raise Refusal(
                "NOT_FOUND", "The workspace is not available. Read the account root for them."
            )
        return workspace

    def read(self, depth):
        node = {
            "ref": {},
            "kind": self.kind,
            "text": self.user.email,
            "operations": list(self.operations),
        }
        workspaces = self.workspaces()
        if depth > 0:
            node["children"] = [
                Call(workspace, {}).note({"path": ""}).read(depth - 1) for workspace in workspaces
            ]
        else:
            node["hasChildren"] = bool(workspaces)
        return node

    def call(self, operations, dry_run):
        self.workspaces()
        results = []
        with transaction.atomic():
            for index, operation in enumerate(operations):
                results.append(self.apply(operation, index))
            if dry_run:
                transaction.set_rollback(True)
        return {
            "results": results,
            "changes": [{"ref": result["ref"], "change": "added"} for result in results],
            "revision": None,
            "dryRun": dry_run,
        }

    def apply(self, operation, index):
        op = operation["op"]
        if op not in self.operations:
            raise Refusal(
                "INVALID_ARGUMENT", f"target: the account root doesn't offer {op}.", index
            )
        missing = [field for field in REQUIRED_FIELDS[op] if field not in operation]
        if missing:
            raise Refusal("INVALID_ARGUMENT", f"{op} needs {', '.join(missing)}.", index)
        if operation["kind"] != "workspace":
            raise Refusal("INVALID_ARGUMENT", "kind: the account root holds workspaces.", index)
        workspace = models.Workspace.objects.create(
            name=workspace_name(operation["text"], index), owner=self.user
        )
        return {"ref": {"workspace": workspace.pk, "path": ""}, "kind": "workspace"}


class Expectations:
    """The versions a call's caller read, and which of them the call relies on."""

    def __init__(self, tree, expected):
        self.tree = tree
        self.files = self._normalized(expected.get("files", {}))
        self.folders = self._normalized(expected.get("folders", {}))
        self.used_folders = {}
        self.first_use = {}
        self.folder_first_use = {}

    @staticmethod
    def _normalized(versions):
        try:
            return {store.normalize_folder(path): version for path, version in versions.items()}
        except store.InvalidPath as error:
            raise Refusal("INVALID_ARGUMENT", f"expected: {error}") from error

    def check(self, path, kind, index):
        """Check the caller read what an operation changes, as it is now."""
        # A folder's listing version, not its files' versions, catches a file added under it.
        if kind == "folder" and any(_under(file, path) for file in self.tree.initial):
            self._check_listing(path, kind, index)
        for file in self.tree.files_of(path, kind):
            if file in self.first_use:
                continue
            if file in self.files:
                if self.files[file] != self.tree.initial[file]:
                    raise Refusal(
                        "FAILED_PRECONDITION",
                        f"{file!r} changed since it was read.",
                        index,
                        {"files": {file: self.tree.initial[file]}},
                    )
                self.first_use.setdefault(file, index)
                continue
            self._check_listing(file, kind, index)

    def _check_listing(self, path, kind, index):
        folder = max(
            (
                folder
                for folder in self.folders
                if _under(path, folder) or (kind == "folder" and folder == path)
            ),
            key=len,
            default=None,
        )
        if folder is None:
            raise Refusal(
                "INVALID_ARGUMENT",
                f"State the version of {path!r}, or of a folder holding it, as read.",
                index,
            )
        current = self.tree.initial_version(folder)
        if self.folders[folder] != current:
            raise Refusal(
                "FAILED_PRECONDITION",
                f"The files under {folder!r} changed since they were read.",
                index,
                {"folders": {folder: current}},
            )
        self.used_folders[folder] = current
        self.folder_first_use.setdefault(folder, index)
        for initial in self.tree.initial:
            if _under(initial, folder):
                self.first_use.setdefault(initial, index)

    def produced(self, path, index):
        """Record a path the call creates, which later operations may change freely."""
        self.first_use.setdefault(path, index)

    def stale(self, error):
        """The refusal for a file or folder the store found stale at commit."""
        first_use = self.folder_first_use if error.folder else self.first_use
        return Refusal(
            "FAILED_PRECONDITION",
            str(error),
            first_use.get(error.path),
            {"folders" if error.folder else "files": {error.path: error.current}},
        )


class Note:
    """A note of a workspace: its reference, kind, text, children and operations."""

    kind = None
    operations = ("read",)

    def __init__(self, call, path):
        self.call = call
        self.tree = call.tree
        self.path = path

    @property
    def text(self):
        return _name(self.path)

    def read(self, depth):
        return {
            "ref": self.call.ref(self.path),
            "kind": self.kind,
            "text": self.text,
            "operations": list(self.operations),
            "version": self.version(),
        }


class Container(Note):
    """A workspace or folder: it holds the files under its path, listed by name."""

    def version(self):
        return self.tree.initial_version(self.path)

    def files(self):
        return self.tree.files_of(self.path, "folder")

    def children(self):
        start = len(self.path) + 1 if self.path else 0
        names = {_join(self.path, file[start:].partition("/")[0]) for file in self.files()}
        return [self.call.note({"path": name}) for name in sorted(names)]

    def read(self, depth):
        node = super().read(depth)
        children = self.children()
        if depth > 0:
            node["children"] = [child.read(depth - 1) for child in children]
        else:
            node["hasChildren"] = bool(children)
        return node

    def insert(self, operation):
        new = FILE_KINDS.get(operation["kind"])
        if new is None:
            self.call.refuse("INVALID_ARGUMENT", f"kind: a {self.kind} holds documents and files.")
        path = self.call.path(_join(self.path, new.name_for(self.call, operation["text"])), "text")
        content = self.call.content(operation)
        new.check_new(self.call, content)
        self.call.place(path)
        self.call.put(path, content)
        return {"ref": self.call.ref(path), "kind": new.kind}


class Workspace(Container):
    kind = "workspace"
    operations = ("read", "insert", "setText")

    @property
    def text(self):
        return self.call.name

    def set_text(self, operation):
        text = self.call.changed_text(self.text, operation)
        self.call.name = workspace_name(text, self.call.index)
        return {"ref": self.call.ref("")}


class Movable(Note):
    """A folder, document or file: it moves, is renamed, and is deleted with its files."""

    @classmethod
    def name_for(cls, call, text):
        if not text or "/" in text:
            call.refuse("INVALID_ARGUMENT", "text: a name is non-empty and has no '/'.")
        return text

    def move(self, operation):
        parent = self.call.note(operation["parent"], "parent")
        if not isinstance(parent, Container):
            self.call.refuse("INVALID_ARGUMENT", "parent: only a workspace or folder holds notes.")
        if parent.path == self.path or (parent.path and _under(parent.path, self.path)):
            self.call.refuse("INVALID_ARGUMENT", "parent: a folder can't move into itself.")
        new_path = _join(parent.path, _name(self.path))
        if new_path != self.path:
            self.relocate(new_path, "parent")
        return {"ref": self.call.ref(new_path)}

    def set_text(self, operation):
        text = self.call.changed_text(self.text, operation)
        new_path = self.call.path(_join(_parent(self.path), self.name_for(self.call, text)), "text")
        self.relocate(new_path, "text")
        return {"ref": self.call.ref(new_path)}

    def delete(self, operation):
        self.call.check(self)
        files = self.files()
        self.tree.load(file for file in files if file.endswith(DOCUMENT_SUFFIX))
        if self.has_children() and not operation.get("withChildren"):
            self.call.refuse(
                "INVALID_ARGUMENT",
                f"{self.path!r} has children; set withChildren to delete them too.",
            )
        removed = []
        for file in files:
            if file.endswith(DOCUMENT_SUFFIX):
                removed += ids_in(self.tree.content(file))
            self.tree.remove(file)
        return {"removedIds": removed}

    def relocate(self, new_path, field):
        self.call.check(self)
        moving = self.files()
        hashes = {old: self.tree.remove(old) for old in moving}
        for old in moving:
            new = self.call.path(new_path + old[len(self.path) :], field)
            self.call.place(new)
            self.tree.add(new, hashes[old])


class Folder(Movable, Container):
    kind = "folder"
    operations = ("read", "insert", "move", "delete", "setText")

    def has_children(self):
        return True


class File(Movable):
    kind = "file"
    operations = ("read", "move", "delete", "setText", "setContent")

    @classmethod
    def name_for(cls, call, text):
        name = super().name_for(call, text)
        if name.endswith(DOCUMENT_SUFFIX):
            call.refuse("INVALID_ARGUMENT", "text: a file named *.md would be a document.")
        return name

    @classmethod
    def check_new(cls, call, content):
        pass

    @property
    def content(self):
        return self.tree.content(self.path)

    def version(self):
        return self.tree.files[self.path]

    def files(self):
        return [self.path]

    def has_children(self):
        return False

    def read(self, depth):
        return {**super().read(depth), "hasChildren": False}

    def set_content(self, operation):
        self.call.check(self)
        current = self.content
        if "replacements" in operation:
            try:
                text = current.decode()
            except UnicodeDecodeError:
                self.call.refuse("INVALID_ARGUMENT", "Replacements apply only to text.")
            content = self.call.encoded(self.call.replaced(text, operation, "content"), "content")
        elif "content" in operation:
            content = self.call.content(operation)
        else:
            self.call.refuse("INVALID_ARGUMENT", "Give content or replacements.")
        if content == current:
            self.call.refuse("INVALID_ARGUMENT", "The content is unchanged.")
        self.check_content(current, content)
        self.call.put(self.path, content)
        return {"ref": self.call.ref(self.path)}

    def check_content(self, current, content):
        pass


class Document(File):
    """A `.md` file read in the RemDo text format; its text is its name without `.md`."""

    kind = "document"

    @classmethod
    def name_for(cls, call, text):
        return Movable.name_for(call, text) + DOCUMENT_SUFFIX

    @classmethod
    def check_new(cls, call, content):
        if ids_in(content):
            call.refuse("INVALID_ARGUMENT", "content: a new document can't carry IDs.")

    @property
    def text(self):
        return _name(self.path)[: -len(DOCUMENT_SUFFIX)]

    def has_children(self):
        return document_has_children(self.content)

    def read(self, depth):
        # Until the format parser lists a document's children, Read can't say whether it has any.
        return Note.read(self, depth)

    def check_content(self, current, content):
        if sorted(ids_in(content)) != sorted(ids_in(current)):
            self.call.refuse("INVALID_ARGUMENT", "content: Set content can't add or remove IDs.")


KINDS = {"workspace": Workspace, "folder": Folder, "document": Document, "file": File}
FILE_KINDS = {"document": Document, "file": File}
METHODS = {
    "insert": "insert",
    "move": "move",
    "delete": "delete",
    "setText": "set_text",
    "setContent": "set_content",
}


class Call:
    """One call: its operations applied in order to the notes of one workspace."""

    def __init__(self, workspace, expected):
        self.workspace = workspace
        self.tree = Tree(workspace)
        self.expectations = Expectations(self.tree, expected)
        self.name = workspace.name
        self.index = 0

    def apply(self, operation):
        op = operation["op"]
        missing = [field for field in REQUIRED_FIELDS[op] if field not in operation]
        if missing:
            self.refuse("INVALID_ARGUMENT", f"{op} needs {', '.join(missing)}.")
        field = "parent" if op == "insert" else "target"
        note = self.note(operation.get(field), field)
        if op not in note.operations:
            self.refuse("INVALID_ARGUMENT", f"{field}: a {note.kind} doesn't offer {op}.")
        return getattr(note, METHODS[op])(operation)

    def note(self, ref, field="target"):
        path = self.path((ref or {}).get("path", ""), field)
        kind = self.tree.kind(path)
        if kind is None:
            self.refuse("NOT_FOUND", f"{field}: no note at {path!r}.")
        return KINDS[kind](self, path)

    def refuse(self, code, message, versions=None):
        raise Refusal(code, message, self.index, versions)

    def ref(self, path):
        return {"workspace": self.workspace.pk, "path": path}

    def check(self, note):
        self.expectations.check(note.path, note.kind, self.index)

    def path(self, path, field):
        try:
            return store.normalize_folder(path)
        except store.InvalidPath as error:
            self.refuse("INVALID_ARGUMENT", f"{field}: {error}")

    def place(self, path):
        reason = self.tree.namespace.conflict(path)
        if reason:
            self.refuse(
                "FAILED_PRECONDITION", f"Can't place {path!r}: {reason}", self.tree.occupants(path)
            )
        self.expectations.produced(path, self.index)

    def put(self, path, content):
        try:
            self.tree.put(path, content)
        except store.InvalidContent as error:
            self.refuse("INVALID_ARGUMENT", f"content: {error}")

    def content(self, operation):
        if "content" not in operation:
            return b""
        value = operation["content"]
        if operation.get("contentEncoding") == "base64":
            try:
                return base64.b64decode(value, validate=True)
            except ValueError:
                self.refuse("INVALID_ARGUMENT", "content is not valid base64.")
        return self.encoded(value, "content")

    def encoded(self, text, field):
        try:
            return text.encode()
        except UnicodeEncodeError:
            self.refuse("INVALID_ARGUMENT", f"{field}: the text isn't valid Unicode.")

    def changed_text(self, current, operation):
        text = self.replaced(current, operation, "text")
        if text == current:
            self.refuse("INVALID_ARGUMENT", "The text is unchanged.")
        return text

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


def change(workspace, author, operations, expected=None, dry_run=False):
    """Apply `operations` as one call: all of them as one commit, or none."""
    call = Call(workspace, expected or {})
    results = []
    for index, operation in enumerate(operations):
        call.index = index
        results.append(call.apply(operation))
    renamed = (
        [{"ref": call.ref(""), "change": "renamed", "text": call.name}]
        if call.name != workspace.name
        else []
    )
    changes = call.tree.changes()
    with transaction.atomic():
        if call.name != workspace.name:
            models.Workspace.objects.filter(pk=workspace.pk).update(name=call.name)
        revision = None
        if changes:
            try:
                revision = store.commit(
                    workspace,
                    author,
                    _message(operations),
                    changes,
                    folders=call.expectations.used_folders,
                )
            except store.StaleFile as error:
                raise call.expectations.stale(error) from error
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
        "changes": renamed
        + [
            _describe(call, path, before, content, dry_run)
            for path, (before, content) in changes.items()
        ],
        "revision": None if revision is None or dry_run else revision.pk,
        "dryRun": dry_run,
    }


def _describe(call, path, before, content, dry_run):
    tree = call.tree
    after = tree.files.get(path)
    description = {
        "ref": call.ref(path),
        "change": "added" if before is None else "deleted" if after is None else "changed",
        "version": after,
    }
    if dry_run and before is not None and content is not None:
        if before not in tree.contents:
            tree.contents.update(store.contents([before]))
        old = tree.contents[before]
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
