"""Create synthetic credentials for public MCP authorization checks."""

import json
import secrets
from datetime import timedelta

from accounts.models import User
from allauth.idp.oidc.models import Token
from django.conf import settings
from django.utils import timezone

user, _ = User.objects.get_or_create(email="mcp-contract@example.test")
credentials = {}
for name in ("valid", "wrong_resource", "missing_scope", "expired", "revoked", "refresh"):
    value = secrets.token_urlsafe(32)
    token = Token(
        type=Token.Type.REFRESH_TOKEN if name == "refresh" else Token.Type.ACCESS_TOKEN,
        user=user,
        expires_at=timezone.now() + timedelta(hours=-1 if name == "expired" else 1),
    )
    token.set_resources(
        ["https://other.example/mcp" if name == "wrong_resource" else f"{settings.APP_ORIGIN}/mcp"]
    )
    token.set_scopes([] if name == "missing_scope" else ["openid"])
    token.set_value(value)
    token.save()
    if name == "revoked":
        token.delete()
    credentials[name] = value

print(json.dumps(credentials))
