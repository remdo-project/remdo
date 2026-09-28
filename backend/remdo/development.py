import os
import socket
from urllib.parse import urlsplit

from . import base
from .base import *  # noqa: F403

DEBUG = True
FRONTEND_USE_SOURCE = os.environ.get("REMDO_DEV_CONTAINER") != "true"
_local_demo_video = base.DATA_DIR / "demo" / "demo.mp4"
# Vite serves checkout files under /@fs/, so the public home can play a local recording.
if not HOME_VIDEO_URL and FRONTEND_USE_SOURCE and _local_demo_video.is_file():  # noqa: F405
    HOME_VIDEO_URL = f"/@fs{_local_demo_video}"
INSTALLED_APPS = [*base.INSTALLED_APPS, "fixtures"]
# Fixture workers share one loopback address and authenticate independently.
ACCOUNT_RATE_LIMITS = False

CSRF_TRUSTED_ORIGINS = [base.APP_ORIGIN]
for host in ("localhost", "127.0.0.1", socket.gethostname().lower().rstrip(".")):
    alias = f"{base.origin.scheme}://{host}:{base.cookie_namespace}"
    if alias not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append(alias)
ALLOWED_HOSTS = [
    *dict.fromkeys(urlsplit(value).hostname for value in CSRF_TRUSTED_ORIGINS),
    "[::1]",
]

SECRET_KEY = base.required("AUTH_SECRET")
COLLAB_INTERNAL_SECRET = base.required("COLLAB_INTERNAL_SECRET")
