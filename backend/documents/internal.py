"""Loopback collaboration operations, authenticated independently of browser sessions."""

from functools import wraps

from accounts.delegated import bearer_token, delegated_user
from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404
from django.utils.crypto import constant_time_compare
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_http_methods

from .models import Document, DocumentContent


def internal_only(view):
    @wraps(view)
    def authenticated(request, *args, **kwargs):
        if not constant_time_compare(
            request.headers.get("X-Remdo-Collaboration-Secret", ""), settings.COLLAB_INTERNAL_SECRET
        ):
            return HttpResponse(status=403)
        return view(request, *args, **kwargs)

    return csrf_exempt(never_cache(authenticated))


@internal_only
@require_GET
def authorize(request, document_id):
    if request.headers.get("X-Remdo-Collaboration-Operator") == "1":
        get_object_or_404(Document, pk=document_id)
        return JsonResponse({"operator": True})
    if bearer_token(authorization := request.headers.get("Authorization", "")):
        user = delegated_user(authorization)
    elif request.headers.get("Origin") in settings.CSRF_TRUSTED_ORIGINS:
        user = request.user
    else:
        user = None
    if user is None or not user.is_authenticated:
        return HttpResponse(status=403)
    document = get_object_or_404(Document, pk=document_id)
    if not Document.objects.accessible_to(user).filter(pk=document.pk).exists():
        return HttpResponse(status=403)
    return JsonResponse({"userId": str(user.pk)})


@internal_only
@require_http_methods(["GET", "PUT"])
def content(request, document_id):
    document = get_object_or_404(Document, pk=document_id)
    if request.method == "GET":
        state = (
            DocumentContent.objects.filter(document=document)
            .values_list("state", flat=True)
            .first()
        )
        return HttpResponse(
            bytes(state) if state is not None else b"", content_type="application/octet-stream"
        )
    if request.content_type != "application/octet-stream":
        return HttpResponse(status=415)
    # Read the binary stream directly: Django's form-body limit does not apply to Yjs state.
    state = request.read()
    DocumentContent.objects.update_or_create(document=document, defaults={"state": state})
    return HttpResponse(status=204)
