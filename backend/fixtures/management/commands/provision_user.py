from accounts.models import User
from allauth.account.models import EmailAddress
from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Create a fixture account. Existing accounts are unchanged."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)
        parser.add_argument("--password", required=True)
        parser.add_argument("--name", default="")
        parser.add_argument("--admin", action="store_true")

    def handle(self, email, password, name, admin, **options):
        email = email.strip().lower()
        user, _ = User.objects.get_or_create(
            email=email,
            defaults={
                "password": make_password(password),
                "first_name": name,
                "is_staff": admin,
                "is_superuser": admin,
            },
        )
        EmailAddress.objects.get_or_create(
            user=user, email=user.email, defaults={"primary": True, "verified": True}
        )
