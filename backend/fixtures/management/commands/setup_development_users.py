import json
from pathlib import Path

from django.core.management import call_command
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Create missing development accounts, or reset them and their database records."

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true")

    def handle(self, reset, **options):
        users = json.loads(
            (Path(__file__).resolve().parents[2] / "development-users.json").read_text()
        ).values()
        if reset:
            call_command("reset_fixture_users", *(f"--email={user['email']}" for user in users))
        for user in users:
            call_command("provision_user", **user)
