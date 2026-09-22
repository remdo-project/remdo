from allauth.account.models import EmailAddress
from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand

from accounts.models import User


class Command(BaseCommand):
    help = "Create an account if it does not already exist. Existing accounts are unchanged."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)
        parser.add_argument("--password", required=True)
        parser.add_argument("--name", default="")
        parser.add_argument("--admin", action="store_true")

    def handle(self, email, password, name, admin, **options):
        email = email.strip().lower()
        # An operator who edits only User.email leaves this address behind on
        # another account; recreating it would abort every later startup.
        if EmailAddress.objects.filter(email=email).exists():
            return
        user, _ = User.objects.get_or_create(
            email=email,
            defaults={
                "password": lambda: make_password(password),
                "first_name": name,
                "is_staff": admin,
                "is_superuser": admin,
            },
        )
        EmailAddress.objects.get_or_create(
            user=user, email=user.email, defaults={"primary": True, "verified": True}
        )
