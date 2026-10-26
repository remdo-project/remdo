"""Django and the native MCP endpoint share one HTTP service."""

import os

from django.conf import settings
from django.contrib.staticfiles.handlers import ASGIStaticFilesHandler
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "remdo.settings")
django_application = get_asgi_application()

from mcp_server.server import create_app  # noqa: E402

application = create_app()
if settings.DEBUG:
    django_application = ASGIStaticFilesHandler(django_application)
application.mount("/", django_application)
