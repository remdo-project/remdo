import os

from django.core.management import call_command
from django.core.management.base import BaseCommand

_CONFIGURED_USERS = (
    (
        "REMDO_ADMIN_PASSWORD",
        {"email": "admin@example.test", "name": "Admin", "admin": True},
    ),
    (
        "REMDO_USER_PASSWORD",
        {"email": "user@example.test", "name": "User", "admin": False},
    ),
)


class Command(BaseCommand):
    help = "Create missing deployment accounts configured by password environment variables."

    def handle(self, **options):
        for password_variable, account in _CONFIGURED_USERS:
            if password := os.environ.get(password_variable):
                call_command("provision_user", password=password, **account)
