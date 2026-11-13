"""The collaboration hub's loads and saves of a workspace's document (docs/architecture.md)."""

import base64
import functools
import json

from django.conf import settings
from django.db import transaction
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_GET, require_http_methods
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
    if request.method == "PUT" and request.content_type != "application/json":
        return HttpResponse(status=415)
    try:
        return _load(workspace) if request.method == "GET" else _save(request, workspace)
    except UnicodeDecodeError:
        return _refuse("UNREADABLE")


def tree_of(content):
    return text_format.to_json(text_format.read(content.decode()))


# Saves compare against the file's reading on every keystroke burst; a file version never changes,
# so its reading is parsed once.
@functools.lru_cache(maxsize=8)
def _reading(blob_hash):
    return tree_of(store.contents([blob_hash])[blob_hash] if blob_hash else b"")


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


@transaction.atomic
def _load(workspace):
    """The room's state, with the file's tree when the state doesn't hold the current file."""
    locked = Workspace.objects.select_for_update().get(pk=workspace.pk)
    version = store.read(locked, README).blob_hash
    row = DocumentState.objects.filter(workspace=locked).first()
    body = {
        "version": version,
        "state": base64.b64encode(bytes(row.state)).decode() if row else None,
    }
    if row is None or row.version != version:
        body["tree"] = _reading(version)
    return JsonResponse(body)


def _save(request, workspace):
    """Write the room's text as its file and its state to its row, together."""
    try:
        data = json.loads(request.read())
        state = base64.b64decode(data["state"])
        content = text_format.write(text_format.from_json(data["tree"])).encode()
        base = data["version"]
    except KeyError, TypeError, ValueError, AttributeError:
        return _refuse("MALFORMED")
    if len(content) > FILE_MAX_BYTES:
        return _refuse("TOO_LARGE")
    return _write(workspace, base, state, content)


@transaction.atomic
def _write(workspace, base, state, content):
    reading = tree_of(content)
    locked = Workspace.objects.select_for_update().get(pk=workspace.pk)
    version = store.read(locked, README).blob_hash
    row = DocumentState.objects.filter(workspace=locked).first()
    # Only the room writes its row, so a row on the current file means the room's last write
    # landed even if its reply was lost.
    if version != base and not (row and row.version == version):
        return JsonResponse({"version": version, "tree": _reading(version)}, status=409)
    # The file's own spelling stays until a save changes what it reads as.
    if reading != _reading(version):
        store.commit(
            locked, locked.owner, SAVE_MESSAGE, {README: (version, content)}, continuing=True
        )
        notify_document_list_changed([locked.owner_id])
        version = store.blob_hash(content)
    DocumentState.objects.update_or_create(
        workspace=locked, defaults={"state": state, "version": version}
    )
    return JsonResponse({"version": version})
