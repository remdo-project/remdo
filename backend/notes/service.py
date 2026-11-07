"""The note service: references resolve from the account root to the source holding the note."""

from workspaces import source as workspaces

from .core import ACCOUNT_ROOT, Call, Refusal, parse_ref, with_children

__all__ = ["Refusal", "call", "read"]


class AccountRoot:
    """The account root: the source listing the account's other sources, which it creates."""

    kind = "account"
    operations = ("read", "insert")
    holds = {"workspace": workspaces.Workspace}

    def __init__(self, call):
        self.call = call
        self.user = call.user

    def read(self, depth, content=False):
        node = {
            "ref": ACCOUNT_ROOT,
            "kind": self.kind,
            "text": self.user.email,
            "operations": list(self.operations),
        }
        return with_children(node, workspaces.workspace_notes(self.user), depth)

    def insert(self, operation):
        new = self.call.new_kind(self, operation["kind"])
        ref = workspaces.create_workspace(self.user, new.name_for(self.call, operation["text"]))
        self.call.created.append(ref)
        return {"ref": ref, "kind": new.kind}


class AccountCall(Call):
    """A call on the account root itself, such as creating a workspace."""

    def __init__(self, user):
        super().__init__(user)
        self.root = AccountRoot(self)
        self.created = []

    def note(self, ref, field="target"):
        return self.root

    def commit(self, operations, dry_run):
        return [{"ref": ref, "change": "added"} for ref in self.created], None


def read(user, ref=None, depth=1, content=False):
    """Read the note `ref` names, resolved from the user's account root."""
    account = AccountCall(user)
    workspace_id = account.parsed(ref, "ref")[0]
    if workspace_id is None:
        return account.root.read(depth, content)
    return workspaces.open_call(user, workspace_id).note(ref, "ref").read(depth, content)


def call(user, operations, expected=None, dry_run=False):
    """Apply `operations` all or none, within one source."""
    scopes = set()
    for index, operation in enumerate(operations):
        refs = [operation[field] for field in ("target", "parent") if field in operation]
        try:
            sources = {parse_ref(ref)[0] for ref in refs or [ACCOUNT_ROOT]}
        except ValueError as error:
            raise Refusal("INVALID_ARGUMENT", str(error), index) from error
        if len(sources) > 1:
            raise Refusal("INVALID_ARGUMENT", "A note can't move between sources.", index)
        scopes |= sources
    if len(scopes) > 1:
        raise Refusal("INVALID_ARGUMENT", "A call changes the notes of one source.")
    [scope] = scopes
    if scope is None:
        return AccountCall(user).run(operations, dry_run)
    return workspaces.open_call(user, scope, expected).run(operations, dry_run)
