"""The workspace source: its document, folders and plain files as notes, one class per kind.

A workspace holds one document, README.md, until multi-file workspaces return. Outline notes,
Markdown blocks and Ensure ID arrive with the text format parser.
"""

import base64
import difflib
import re

from notes.core import Call, Refusal, with_children

from . import models, store
from .models import WORKSPACE_NAME_MAX_LENGTH

DOCUMENT_SUFFIX = ".md"
README = "README.md"
MISSING_WORKSPACE = "The workspace is not available. Read the account root for them."
# The text format's ID note, as in `- id:: k3x9`; the format parser replaces this.
ID_NOTE = re.compile(r"^[ \t>]*[-*+][ \t]+id::[ \t]*(\S+)[ \t]*\r?$", re.MULTILINE)


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

    def initial_version(self, folder):
        return store.listing_version(
            {path: hash_ for path, hash_ in self.initial.items() if store.under(path, folder)}
        )

    def load(self, paths):
        self.load_blobs(self.files[path] for path in paths)

    def load_blobs(self, hashes):
        missing = set(hashes) - self.contents.keys()
        if missing:
            self.contents.update(store.contents(missing))

    def content(self, path):
        return self.blob(self.files[path])

    def blob(self, hash_):
        self.load_blobs([hash_])
        return self.contents[hash_]

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
        """The stored versions of what occupies `path`, ignoring case, by path."""
        return store.occupants(self.namespace, self.initial, path)

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


class Expectations:
    """The versions a call's caller read, and which of them the call relies on."""

    def __init__(self, tree, versions, ref):
        """`versions` maps each path the caller read to its version; `ref` names a path."""
        self.tree = tree
        self.ref = ref
        # A null version records a file read as missing, such as a README not yet saved.
        self.files = {path: v for path, v in versions.items() if path in tree.initial or v is None}
        self.folders = {path: v for path, v in versions.items() if path not in self.files}
        self.first_use = {}
        self.folder_first_use = {}

    def check(self, note, index):
        """Check the caller read what an operation on `note` changes, as it is now."""
        # A folder's listing version, not its files' versions, catches a file added under it.
        if note.listing and any(store.under(file, note.path) for file in self.tree.initial):
            self._check_listing(note.path, True, index)
        for file in note.files():
            if file in self.first_use:
                continue
            if file in self.files:
                current = self.tree.initial.get(file)
                if self.files[file] != current:
                    raise Refusal(
                        "FAILED_PRECONDITION",
                        f"{file!r} changed since it was read.",
                        index,
                        {self.ref(file): current},
                    )
                self.first_use.setdefault(file, index)
                continue
            self._check_listing(file, False, index)

    def _check_listing(self, path, listing, index):
        folder = max(
            (
                folder
                for folder in self.folders
                if store.under(path, folder) or (listing and folder == path)
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
                {self.ref(folder): current},
            )
        self.folder_first_use.setdefault(folder, index)
        for initial in self.tree.initial:
            if store.under(initial, folder):
                self.first_use.setdefault(initial, index)

    def used_folders(self):
        """The listing version of each folder the call relied on, for the store to recheck."""
        return {folder: self.tree.initial_version(folder) for folder in self.folder_first_use}

    def produced(self, path, index):
        """Record a path the call creates, which later operations may change freely."""
        self.first_use.setdefault(path, index)

    def absent_folder(self, folder, index):
        """Require `folder` to hold nothing when the call commits, as when the call read it."""
        self.folder_first_use.setdefault(folder, index)

    def stale(self, error):
        """The refusal for a file or folder the store found stale at commit."""
        first_use = self.folder_first_use if error.folder else self.first_use
        return Refusal(
            "FAILED_PRECONDITION",
            str(error),
            first_use.get(error.path),
            {self.ref(error.path): error.current},
        )


class Note:
    """A note of a workspace: its reference, kind, text, children and operations."""

    kind = None
    operations = ("read",)
    listing = False

    def __init__(self, call, path):
        self.call = call
        self.tree = call.tree
        self.path = path

    @property
    def text(self):
        return _name(self.path)

    def read(self, depth, content=False):
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
        return sorted(file for file in self.tree.files if store.under(file, self.path))

    def children(self):
        start = len(self.path) + 1 if self.path else 0
        names = {_join(self.path, file[start:].partition("/")[0]) for file in self.files()}
        return [self.call.note_at(name) for name in sorted(names)]

    def read(self, depth, content=False):
        return with_children(super().read(depth), self.children(), depth)

    def insert(self, operation):
        new = self.call.new_kind(self, operation["kind"])
        path = self.call.path(_join(self.path, new.name_for(self.call, operation["text"])), "text")
        content = self.call.content(operation)
        new.check_new(self.call, content)
        self.call.place(path)
        self.call.put(path, content)
        return {"ref": self.call.ref(path), "kind": new.kind}


class Workspace(Container):
    kind = "workspace"

    @property
    def operations(self):
        if self.call.single_file:
            return ("read", "delete", "setText")
        return ("read", "insert", "delete", "setText")

    @classmethod
    def name_for(cls, call, text):
        call.encoded(text, "text")
        if not text.strip() or len(text) > WORKSPACE_NAME_MAX_LENGTH:
            call.refuse(
                "INVALID_ARGUMENT",
                f"text: a workspace name has 1 to {WORKSPACE_NAME_MAX_LENGTH} characters.",
            )
        return text

    @property
    def text(self):
        return self.call.name

    def children(self):
        if self.call.single_file:
            return [self.call.note_at(README)]
        return super().children()

    def set_text(self, operation):
        self.call.name = self.name_for(self.call, self.call.changed_text(self.text, operation))
        return {"ref": self.call.ref("")}

    def delete(self, operation):
        if not operation.get("withChildren"):
            self.call.refuse(
                "INVALID_ARGUMENT", "A workspace holds its document; set withChildren to delete it."
            )
        self.call.deleted = True
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
        if parent.path == self.path or (parent.path and store.under(parent.path, self.path)):
            self.call.refuse("INVALID_ARGUMENT", "parent: a folder can't move into itself.")
        new_path = _join(parent.path, _name(self.path))
        if new_path != self.path:
            self.relocate(new_path, "parent")
        return {"ref": self.call.ref(new_path)}

    def set_text(self, operation):
        text = self.call.changed_text(self.text, operation)
        new_path = self.call.path(_join(_parent(self.path), self.name_for(self.call, text)), "text")
        if new_path == self.path:
            self.call.refuse("INVALID_ARGUMENT", "The text is unchanged.")
        self.relocate(new_path, "text")
        return {"ref": self.call.ref(new_path)}

    def delete(self, operation):
        self.call.check(self)
        if self.has_children() and not operation.get("withChildren"):
            self.call.refuse(
                "INVALID_ARGUMENT",
                f"{self.path!r} has children; set withChildren to delete them too.",
            )
        for file in self.files():
            self.tree.remove(file)
        return {"ref": self.call.ref(self.path)}

    def relocate(self, new_path, field):
        self.call.check(self)
        moving = self.files()
        hashes = {old: self.tree.remove(old) for old in moving}
        if self.listing:
            self.call.place_folder(new_path)
        for old in moving:
            new = self.call.path(new_path + old[len(self.path) :], field)
            self.call.place(new)
            self.tree.add(new, hashes[old])


class Folder(Movable, Container):
    kind = "folder"
    operations = ("read", "insert", "move", "delete", "setText")
    listing = True

    def has_children(self):
        return True


class File(Movable):
    kind = "file"
    operations = ("read", "move", "delete", "setText", "setContent")
    children_known = True

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

    def read(self, depth, content=False):
        node = super().read(depth)
        if self.children_known:
            node["hasChildren"] = False
        if content:
            node.update(decode(self.content))
        return node

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

    @property
    def operations(self):
        return ("read", "setContent") if self.call.single_file else super().operations

    # Until the format parser lists a document's children, Read can't say whether it has any.
    children_known = False

    @classmethod
    def name_for(cls, call, text):
        return Movable.name_for(call, text) + DOCUMENT_SUFFIX

    @classmethod
    def check_text(cls, call, content):
        try:
            content.decode()
        except UnicodeDecodeError:
            call.refuse("INVALID_ARGUMENT", "content: a document is UTF-8 text.")

    @classmethod
    def check_new(cls, call, content):
        cls.check_text(call, content)
        if ids_in(content):
            call.refuse("INVALID_ARGUMENT", "content: a new document can't carry IDs.")

    @property
    def text(self):
        return _name(self.path)[: -len(DOCUMENT_SUFFIX)]

    def has_children(self):
        return document_has_children(self.content)

    def check_content(self, current, content):
        self.check_text(self.call, content)
        if sorted(ids_in(content)) != sorted(ids_in(current)):
            self.call.refuse("INVALID_ARGUMENT", "content: Set content can't add or remove IDs.")


class Readme(Document):
    """A workspace's one document, which reads as empty until its first save creates it."""

    @property
    def content(self):
        return self.tree.content(self.path) if self.path in self.tree.files else b""

    def version(self):
        return self.tree.files.get(self.path)


KINDS = {"workspace": Workspace, "folder": Folder, "document": Document, "file": File}
Container.holds = {"document": Document, "file": File}


def workspace_notes(user):
    """The user's workspaces as notes by name, for the account root to list."""
    workspaces = models.Workspace.objects.filter(owner=user).order_by("name", "id")
    return [WorkspaceCall(user, workspace).note_at("") for workspace in workspaces]


def open_call(user, workspace_id, expected=None):
    """A call on one of the user's workspaces; other users' are refused as missing."""
    workspace = models.Workspace.objects.filter(owner=user, pk=workspace_id).first()
    if workspace is None:
        raise Refusal("NOT_FOUND", MISSING_WORKSPACE)
    return WorkspaceCall(user, workspace, expected)


def create_workspace(call, name, content):
    """Create a workspace for the call's user, with a call on it that writes any README content.

    The caller commits that call with its own, so the README's revision is part of its result.
    """
    workspace = models.Workspace.objects.create(name=name, owner=call.user)
    if not content:
        return workspace.pk, None
    files = WorkspaceCall(call.user, workspace)
    files.index = call.index
    Document.check_new(files, content)
    files.put(README, content)
    return workspace.pk, files


class WorkspaceCall(Call):
    """A call on the notes of one workspace, applied to a tree of its files."""

    # Multi-file workspaces return with a later plan (docs/text-format-plan.md); until then their
    # tests turn this off to keep the folder and plain-file kinds working.
    single_file = True

    def __init__(self, user, workspace, expected=None):
        super().__init__(user)
        self.workspace = workspace
        self.tree = Tree(workspace)
        self.expectations = Expectations(self.tree, self.expected_paths(expected or {}), self.ref)
        self.name = workspace.name
        self.deleted = False

    def apply(self, operation):
        if self.deleted:
            self.refuse("INVALID_ARGUMENT", "The workspace was deleted earlier in this call.")
        return super().apply(operation)

    def expected_paths(self, expected):
        paths = {}
        for ref, version in expected.items():
            workspace_id, path, note_id = self.parsed(ref, "expected")
            if workspace_id == self.workspace.pk and not note_id:
                paths[self.path(path, "expected")] = version
        return paths

    def note(self, ref, field="target"):
        _, path, note_id = self.parsed(ref, field)
        if note_id:
            self.refuse(
                "INVALID_ARGUMENT",
                f"{field}: ID references arrive with outline notes; use the path Read returns.",
            )
        path = self.path(path, field)
        if not self.is_readme(path) and self.tree.kind(path) is None:
            self.refuse("NOT_FOUND", f"{field}: no note at {path!r}.")
        return self.note_at(path)

    def note_at(self, path):
        if self.is_readme(path):
            return Readme(self, path)
        return KINDS[self.tree.kind(path)](self, path)

    def is_readme(self, path):
        return self.single_file and path == README

    def commit(self, operations, dry_run):
        if self.deleted:
            # The store's commit lock, so a concurrent save can't add history the deletion misses.
            locked = (
                models.Workspace.objects.select_for_update().filter(pk=self.workspace.pk).first()
            )
            if locked is not None:
                locked.delete()
            return [{"ref": self.ref(""), "change": "deleted"}], None
        described = []
        if self.name != self.workspace.name:
            if not models.Workspace.objects.filter(pk=self.workspace.pk).update(name=self.name):
                raise Refusal("NOT_FOUND", MISSING_WORKSPACE)
            described.append({"ref": self.ref(""), "change": "renamed", "text": self.name})
        changes = self.tree.changes()
        revision = None
        if changes:
            try:
                revision = store.commit(
                    self.workspace,
                    self.user,
                    _message(operations),
                    changes,
                    folders=self.expectations.used_folders(),
                )
            except store.StaleFile as error:
                raise self.expectations.stale(error) from error
            # Deleted by a concurrent call since this one opened it.
            except models.Workspace.DoesNotExist as error:
                raise Refusal("NOT_FOUND", MISSING_WORKSPACE) from error
            # Every path was checked against the tree, so a conflict here is a concurrent change.
            except store.PathTaken as error:
                raise Refusal(
                    "FAILED_PRECONDITION",
                    f"Can't place {error.path!r}: {error}",
                    self.expectations.first_use.get(error.path),
                    {self.ref(path): version for path, version in error.occupants.items()},
                ) from error
        if dry_run:
            self.tree.load_blobs(
                before for before, content in changes.values() if before and content is not None
            )
        described += [
            _describe(self, path, before, content, dry_run)
            for path, (before, content) in changes.items()
        ]
        return described, revision

    def ref(self, path):
        return f"{self.workspace.pk}/{path}" if path else self.workspace.pk

    def check(self, note):
        self.expectations.check(note, self.index)

    def path(self, path, field):
        try:
            return store.normalize_folder(path)
        except store.InvalidPath as error:
            self.refuse("INVALID_ARGUMENT", f"{field}: {error}")

    def place(self, path):
        self.refuse_taken(path, self.tree.namespace.conflict(path))
        self.expectations.produced(path, self.index)

    def place_folder(self, path):
        existing = self.tree.namespace.folder(path)
        if existing:
            self.refuse_taken(path, f"folder {existing!r} already exists.")
        self.expectations.absent_folder(path, self.index)

    def refuse_taken(self, path, reason):
        if reason:
            occupants = self.tree.occupants(path)
            self.refuse(
                "FAILED_PRECONDITION",
                f"Can't place {path!r}: {reason}",
                {self.ref(occupant): version for occupant, version in occupants.items()},
            )

    def put(self, path, content):
        try:
            self.tree.put(path, content)
        except store.InvalidContent as error:
            self.refuse("INVALID_ARGUMENT", f"content: {error}")


def _describe(call, path, before, content, dry_run):
    tree = call.tree
    after = tree.files.get(path)
    description = {
        "ref": call.ref(path),
        "change": "added" if before is None else "deleted" if after is None else "changed",
        "version": after,
    }
    if dry_run and before is not None and content is not None:
        old = tree.blob(before)
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
