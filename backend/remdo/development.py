import os
import socket
from urllib.parse import urlsplit

from . import base
from .base import *  # noqa: F403

DEBUG = True
INSTALLED_APPS = [*base.INSTALLED_APPS, "fixtures"]
# Fixture workers share one loopback address and authenticate independently.
ACCOUNT_RATE_LIMITS = False

CSRF_TRUSTED_ORIGINS = [base.APP_ORIGIN]
for host in ("localhost", "127.0.0.1", socket.gethostname().lower().rstrip(".")):
    alias = f"{base.origin.scheme}://{host}:{base.cookie_namespace}"
    if alias not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append(alias)
if preview_port := os.environ.get("PREVIEW_PORT"):
    for host in ("localhost", "127.0.0.1"):
        alias = f"{base.origin.scheme}://{host}:{int(preview_port)}"
        if alias not in CSRF_TRUSTED_ORIGINS:
            CSRF_TRUSTED_ORIGINS.append(alias)
ALLOWED_HOSTS = [
    *dict.fromkeys(urlsplit(value).hostname for value in CSRF_TRUSTED_ORIGINS),
    "[::1]",
]

SECRET_KEY = base.required("AUTH_SECRET")
YSWEET_AUTH_KEY = base.required("YSWEET_AUTH_KEY")
YSWEET_SERVER_TOKEN = base.required("YSWEET_SERVER_TOKEN")
YSWEET_CONNECTION_STRING = base.required("YSWEET_CONNECTION_STRING")
