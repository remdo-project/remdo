"""Start the native collaboration server with Django's configured credentials."""

import os

from django.conf import settings

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "remdo.settings")
environment = dict(os.environ)
for key in ("AUTH_SECRET", "YSWEET_AUTH_KEY", "YSWEET_SERVER_TOKEN"):
    environment.pop(key, None)
environment.update(Y_SWEET_AUTH=settings.YSWEET_AUTH_KEY, RUST_LOG="error")
os.execvpe(
    "y-sweet",
    [
        "y-sweet",
        "serve",
        "--host",
        "127.0.0.1",
        "--port",
        os.environ["COLLAB_SERVER_PORT"],
        "--prod",
        str(settings.DATA_DIR / "collab"),
    ],
    environment,
)
