"""Delegated access: third-party applications acting as a user through OAuth."""

import base64

from allauth.idp.oidc.adapter import DefaultOIDCAdapter
from allauth.idp.oidc.internal.cimd import is_cimd_url
from allauth.idp.oidc.models import Client, PrivateKey, Token
from allauth.idp.oidc.views import authorization
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.http import Http404
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_http_methods
from drf_spectacular.extensions import OpenApiAuthenticationExtension
from rest_framework.authentication import BaseAuthentication, get_authorization_header

from .models import SigningKey


def may_delegate(user):
    # Control of a third-party application must not grant administration.
    return user.is_active and not user.is_staff and not user.is_superuser


def delegated_user(authorization_header):
    """The user a bearer access token acts as, or None."""
    scheme, _, value = authorization_header.partition(" ")
    if scheme.lower() != "bearer" or not value:
        return None
    token = Token.objects.lookup(Token.Type.ACCESS_TOKEN, value.strip())
    if token is None or token.user is None or not may_delegate(token.user):
        return None
    return token.user


class DelegatedAccessAuthentication(BaseAuthentication):
    def authenticate(self, request):
        user = delegated_user(get_authorization_header(request).decode("latin-1"))
        return (user, None) if user else None

    def authenticate_header(self, request):
        return "Bearer"


class DelegatedAccessScheme(OpenApiAuthenticationExtension):
    target_class = DelegatedAccessAuthentication
    name = "delegatedAccess"

    def get_security_definition(self, auto_schema):
        return {"type": "http", "scheme": "bearer"}


def _fernet():
    key = HKDF(
        algorithm=hashes.SHA256(), length=32, salt=None, info=b"remdo delegated signing key"
    ).derive(settings.SECRET_KEY.encode())
    return Fernet(base64.urlsafe_b64encode(key))


def _generate_pem():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()


def signing_key_pem():
    """The stored key, replaced when it cannot be decrypted under the current secret.

    ID tokens are short-lived and RemDo never accepts them, so a replaced key
    affects no credential RemDo relies on.
    """
    fernet = _fernet()
    if stored := SigningKey.objects.filter(pk=1).first():
        try:
            return fernet.decrypt(stored.encrypted_pem.encode()).decode()
        except InvalidToken:
            pass
    pem = _generate_pem()
    SigningKey.objects.update_or_create(
        pk=1, defaults={"encrypted_pem": fernet.encrypt(pem.encode()).decode()}
    )
    return pem


class OIDCAdapter(DefaultOIDCAdapter):
    # A grant acts as the whole user, whatever scopes the client requests.
    scope_display = {}

    def list_private_keys(self, **kwargs):
        return [PrivateKey(pem=signing_key_pem())]


def unavailable_grant(request):
    raise Http404


@never_cache
def authorize(request):
    client_id = request.GET.get("client_id")
    # Applications identify themselves only by client metadata documents.
    if client_id is not None and not is_cimd_url(client_id):
        return render(
            request, "accounts/delegation_refused.html", {"unknown_app": True}, status=400
        )
    if request.user.is_authenticated and not may_delegate(request.user):
        return render(request, "accounts/delegation_refused.html", status=403)
    return authorization(request)


@never_cache
@login_required
@require_http_methods(["GET", "POST"])
def connected_apps(request):
    tokens = Token.objects.filter(user=request.user, client__isnull=False)
    if request.method == "POST":
        client = get_object_or_404(Client, pk=request.POST.get("client"))
        tokens.filter(client=client).delete()
        return redirect(request.path)
    clients = Client.objects.filter(
        pk__in=tokens.valid()
        .filter(type__in=[Token.Type.ACCESS_TOKEN, Token.Type.REFRESH_TOKEN])
        .values("client")
    ).order_by("name")
    return render(request, "accounts/connected_apps.html", {"clients": clients})
