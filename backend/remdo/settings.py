import os
from urllib.parse import urlsplit

from django.core.exceptions import ImproperlyConfigured

from . import base
from .base import *  # noqa: F403
from .secrets import load_secrets

if store := os.environ.get("Y_SWEET_STORE", "").strip():
    location = urlsplit(store)
    if (
        location.scheme != "s3"
        or not location.hostname
        or location.netloc != location.hostname
        or location.query
        or location.fragment
    ):
        raise ImproperlyConfigured("Y_SWEET_STORE must be an s3://bucket/prefix URL.")
    YSWEET_STORE = store.rstrip("/")

_secrets = load_secrets(base.DATA_DIR)
SECRET_KEY = _secrets["auth_secret"]
YSWEET_AUTH_KEY = _secrets["ysweet_auth_key"]
YSWEET_SERVER_TOKEN = _secrets["ysweet_server_token"]
YSWEET_CONNECTION_STRING = "ys://127.0.0.1:4004"
# Only the loopback gateway can reach Gunicorn; it replaces forwarding headers.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
