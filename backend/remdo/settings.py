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
