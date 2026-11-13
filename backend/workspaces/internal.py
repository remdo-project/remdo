"""The collaboration hub's loads and saves of a workspace's document (docs/architecture.md)."""

import base64
import json

from django.conf import settings
from django.db import transaction
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.http import require_GET, require_http_methods, require_POST
from documents.notices import notify_document_list_changed
from notes.service import can_use_workspaces

from . import store, text_format
from .models import FILE_MAX_BYTES, DocumentState, Workspace
from .source import README

SAVE_MESSAGE = "Edit in the editor"


@require_GET
def authorize(request, workspace_id):
    """Only the owner's browser sessions open the room; integrations use note operations."""
    workspace = get_object_or_404(Workspace, pk=workspace_id)
    user = request.user
    if (
        request.headers.get("Origin") not in settings.CSRF_TRUSTED_ORIGINS
        or not user.is_authenticated
        or user.pk != workspace.owner_id
        or not can_use_workspaces(user)
    ):
        return HttpResponse(status=403)
    return JsonResponse({"userId": str(user.pk)})


@require_http_methods(["GET", "PUT"])
def content(request, workspace_id):
    workspace = get_object_or_404(Workspace, pk=workspace_id)
    if request.method == "GET":
        return _load(workspace)
    if request.content_type != "application/json":
        return HttpResponse(status=415)
    return _save(request, workspace)


def tree_of(content):
    return text_format.to_json(text_format.read(content.decode()))


def _tree(file):
    return tree_of(file.content or b"")


def _refuse(reason):
    if settings.SENTRY_DSN:
        import sentry_sdk

        sentry_sdk.capture_message(
            "Workspace room refused",
            level="warning",
            tags={"workspace.refusal": reason},
            fingerprint=["workspace-room-refused", reason],
        )
    return JsonResponse({"code": reason}, status=422)


def _load(workspace):
    """The room's state, with the file's tree when the state doesn't hold the current file."""
    file = store.read(workspace, README)
    row = DocumentState.objects.filter(workspace=workspace).first()
    body = {
        "version": file.blob_hash,
        "state": base64.b64encode(bytes(row.state)).decode() if row else None,
        "uncommittedSince": row.uncommitted_since.isoformat()
        if row and row.uncommitted_since
        else None,
    }
    if row is None or row.blob_id != file.blob_hash:
        try:
            body["tree"] = _tree(file)
        except UnicodeDecodeError:
            return _refuse("UNREADABLE")
    return JsonResponse(body)


def _save(request, workspace):
    """Keep the room's state and text in its row, writing the file too when committing."""
    try:
        data = json.loads(request.read())
        state = base64.b64decode(data["state"])
        content = text_format.write(text_format.from_json(data["tree"])).encode()
    except KeyError, TypeError, ValueError, AttributeError:
        return _refuse("MALFORMED")
    if len(content) > FILE_MAX_BYTES:
        return _refuse("TOO_LARGE")
    try:
        return _write(workspace, data["version"], state, content, data.get("commit") is True)
    except UnicodeDecodeError:
        return _refuse("UNREADABLE")


@transaction.atomic
def _write(workspace, base, state, content, commit):
    locked = Workspace.objects.select_for_update().get(pk=workspace.pk)
    file = store.read(locked, README)
    row = DocumentState.objects.filter(workspace=locked).first()
    # Only the room writes its row, so a row on the current file means the room's last write
    # landed even if its reply was lost.
    if file.blob_hash != base and not (row and row.blob_id == file.blob_hash):
        return JsonResponse({"version": file.blob_hash, "tree": _tree(file)}, status=409)
    version = file.blob_hash
    uncommitted_since = None
    # The file's own spelling stays until a commit changes what it reads as.
    if tree_of(content) != _tree(file):
        if commit:
            version = _commit(locked, file, content)
        else:
            uncommitted_since = (row and row.uncommitted_since) or timezone.now()
    DocumentState.objects.update_or_create(
        workspace=locked,
        defaults={
            "state": state,
            "text": content.decode(),
            "blob_id": version,
            "uncommitted_since": uncommitted_since,
        },
    )
    return JsonResponse({"version": version})


def _commit(workspace, file, content):
    store.commit(workspace, workspace.owner, SAVE_MESSAGE, {README: (file.blob_hash, content)})
    notify_document_list_changed([workspace.owner_id])
    return store.blob_hash(content)


@require_POST
def commit_pending(request):
    """Commit every row's text its file lacks, as a starting hub does for rooms it didn't commit."""
    committed = 0
    for workspace_id in DocumentState.objects.filter(uncommitted_since__isnull=False).values_list(
        "workspace_id", flat=True
    ):
        with transaction.atomic():
            locked = Workspace.objects.select_for_update().get(pk=workspace_id)
            row = DocumentState.objects.get(workspace=locked)
            file = store.read(locked, README)
            # A file changed since the row's version is applied when the room next loads.
            if row.uncommitted_since is None or file.blob_hash != row.blob_id:
                continue
            content = row.text.encode()
            if tree_of(content) != _tree(file):
                row.blob_id = _commit(locked, file, content)
                committed += 1
            row.uncommitted_since = None
            row.save(update_fields=["blob", "uncommitted_since"])
    return JsonResponse({"committed": committed})
