"""What every note source shares: references, refusals, and how a call runs."""

from django.db import transaction

ACCOUNT_ROOT = "me"
OPERATIONS = {
    "insert": ("insert", ("kind", "text")),
    "move": ("move", ("target", "parent")),
    "delete": ("delete", ("target",)),
    "setText": ("set_text", ("target",)),
    "setContent": ("set_content", ("target",)),
}


class Refusal(Exception):
    def __init__(self, code, message, index=None, versions=None):
        super().__init__(message)
        self.code = code
        self.index = index
        self.versions = versions or {}


def parse_ref(ref):
    """Split a reference into its workspace ID, path and note ID; the account root has none.

    Raises ValueError for a string that isn't a reference.
    """
    if not isinstance(ref, str) or not ref:
        raise ValueError("a reference is a non-empty string.")
    if ref == ACCOUNT_ROOT:
        return None, "", None
    workspace, slash, path = ref.partition("/")
    if slash:
        if not workspace or not path:
            raise ValueError(f"{ref!r} isn't a reference.")
        return workspace, path, None
    workspace, underscore, note_id = ref.partition("_")
    if not workspace or (underscore and not note_id):
        raise ValueError(f"{ref!r} isn't a reference.")
    return workspace, "", note_id or None


def with_children(node, children, depth):
    """Add a container's children to its read node, or whether it has any at the depth limit."""
    if depth > 0:
        node["children"] = [child.read(depth - 1) for child in children]
    else:
        node["hasChildren"] = bool(children)
    return node


class Call:
    """One call: its operations applied in order to the notes of one source.

    Each source kind subclasses it to find its notes and save what they changed.
    """

    def __init__(self, user):
        self.user = user
        self.index = None

    def note(self, ref, field):
        raise NotImplementedError

    def commit(self, operations, dry_run):
        """Save what the operations changed; return its description and any revision."""
        raise NotImplementedError

    def run(self, operations, dry_run):
        with transaction.atomic():
            results = []
            for self.index, operation in enumerate(operations):
                results.append(self.apply(operation))
            self.index = None
            changes, revision = self.commit(operations, dry_run)
            if dry_run:
                transaction.set_rollback(True)
        return {
            "results": results,
            "changes": changes,
            "revision": None if revision is None or dry_run else revision.pk,
            "dryRun": dry_run,
        }

    def apply(self, operation):
        op = operation["op"]
        method, required = OPERATIONS[op]
        missing = [field for field in required if field not in operation]
        if missing:
            self.refuse("INVALID_ARGUMENT", f"{op} needs {', '.join(missing)}.")
        field = "parent" if op == "insert" else "target"
        note = self.note(operation.get(field), field)
        if op not in note.operations:
            self.refuse("INVALID_ARGUMENT", f"{field}: a {note.kind} doesn't offer {op}.")
        return getattr(note, method)(operation)

    def refuse(self, code, message, versions=None):
        raise Refusal(code, message, self.index, versions)

    def parsed(self, ref, field):
        try:
            return parse_ref(ACCOUNT_ROOT if ref is None else ref)
        except ValueError as error:
            self.refuse("INVALID_ARGUMENT", f"{field}: {error}")

    def new_kind(self, parent, kind):
        new = parent.holds.get(kind)
        if new is None:
            held = " and ".join(f"{name}s" for name in parent.holds)
            self.refuse("INVALID_ARGUMENT", f"kind: a {parent.kind} holds {held}.")
        return new

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
