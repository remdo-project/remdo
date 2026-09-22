import os
from urllib.parse import urlsplit

from django.core.management import call_command
from django.core.management.base import BaseCommand

_CONFIGURED_USERS = (
    ("REMDO_ADMIN_PASSWORD", "admin", {"name": "Admin", "admin": True}),
    ("REMDO_USER_PASSWORD", "user", {"name": "User", "admin": False}),
)
_FIXED_DOMAIN = "example.test"


def _account_domain():
    """Render guarantees a real public hostname; other deployments may serve an
    address that is invalid in an email, such as a bare IP or `*.localhost`."""
    if not os.environ.get("RENDER"):
        return _FIXED_DOMAIN
    return urlsplit(os.environ.get("APP_ORIGIN", "")).hostname or _FIXED_DOMAIN


class Command(BaseCommand):
    help = "Create missing deployment accounts configured by password environment variables."

    def handle(self, **options):
        domain = _account_domain()
        for password_variable, local_part, account in _CONFIGURED_USERS:
            if password := os.environ.get(password_variable):
                call_command(
                    "provision_user",
                    email=f"{local_part}@{domain}",
                    password=password,
                    **account,
                )
