import os

from . import base
from .base import *  # noqa: F403
from .secrets import load_secrets

_secrets = load_secrets(base.DATA_DIR)
SECRET_KEY = _secrets["auth_secret"]
YSWEET_AUTH_KEY = _secrets["ysweet_auth_key"]
YSWEET_SERVER_TOKEN = _secrets["ysweet_server_token"]
YSWEET_CONNECTION_STRING = "ys://127.0.0.1:4004"
# Only the loopback gateway can reach Gunicorn; it replaces forwarding headers.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
# Caddy replaces untrusted X-Forwarded-For with the connecting address.
ALLAUTH_TRUSTED_PROXY_COUNT = 1
# Render's public edge overwrites this single-address header; Caddy passes it through.
# https://render.com/articles/host-pocketbase-on-render
if os.environ.get("RENDER") == "true":
    ALLAUTH_TRUSTED_CLIENT_IP_HEADER = "CF-Connecting-IP"

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"request_error": {"()": "remdo.logging.RequestErrorFormatter"}},
    "handlers": {
        "stderr": {
            "class": "logging.StreamHandler",
            "formatter": "request_error",
        },
    },
    "loggers": {
        "django.request": {"handlers": ["stderr"], "level": "WARNING", "propagate": False},
        "django.security": {"handlers": ["stderr"], "level": "WARNING", "propagate": False},
    },
}
