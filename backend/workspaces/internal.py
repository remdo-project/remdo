"""The collaboration hub's loads and saves of a workspace's document (docs/architecture.md)."""

import base64
import json

from django.conf import settings
from django.db import transaction
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_http_methods
from documents.notices import notify_document_list_changed
from notes.service import can_use_workspaces

from . import store, text_format
from .models import DocumentState, Workspace
from .source import README

SAVE_MESSAGE = "Edit in the editor"


def authorize(request, workspace):
    """Only the owner's browser sessions open the room; integrations use note operations."""
    user = request.user
    if (
        request.headers.get("Origin") not in settings.CSRF_TRUSTED_ORIGINS
        or not user.is_authenticated
        or user.pk != workspace.owner_id
        or not can_use_workspaces(user)
    ):
        return HttpResponse(status=403)
    return JsonResponse({"userId": str(user.pk), "workspace": True})


@require_http_methods(["GET", "PUT"])
def content(request, workspace_id):
    workspace = get_object_or_404(Workspace, pk=workspace_id)
    if request.method == "GET":
        return _load(workspace)
    if request.content_type != "application/json":
        return HttpResponse(status=415)
    return _save(request, workspace)


def _tree(file):
    text = file.content.decode() if file.content is not None else ""
    return text_format.to_json(text_format.read(text))


def _load(workspace):
    """The room's state, with the file's tree when the state doesn't hold the current file."""
    file = store.read(workspace, README)
    row = DocumentState.objects.filter(workspace=workspace).first()
    body = {
        "version": file.blob_hash,
        "state": base64.b64encode(bytes(row.state)).decode() if row else None,
    }
    if row is None or row.blob_id != file.blob_hash:
        body["tree"] = _tree(file)
    return JsonResponse(body)


def _save(request, workspace):
    """Write the tree's text and the state holding it together, or refuse a stale state."""
    data = json.loads(request.read())
    state = base64.b64decode(data["state"])
    content = text_format.write(text_format.from_json(data["tree"])).encode()
    with transaction.atomic():
        locked = Workspace.objects.select_for_update().get(pk=workspace.pk)
        file = store.read(locked, README)
        if file.blob_hash != data["version"]:
            return JsonResponse({"version": file.blob_hash, "tree": _tree(file)}, status=409)
        version = file.blob_hash
        if content != (file.content or b""):
            store.commit(locked, locked.owner, SAVE_MESSAGE, {README: (file.blob_hash, content)})
            version = store.blob_hash(content)
            notify_document_list_changed([locked.owner_id])
        DocumentState.objects.update_or_create(
            workspace=locked, defaults={"state": state, "blob_id": version}
        )
    return JsonResponse({"version": version})
