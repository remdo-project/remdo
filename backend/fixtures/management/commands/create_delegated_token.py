import secrets

from accounts.models import User
from allauth.idp.oidc.models import Token
from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = "Internal fixture setup: print a fresh delegated access token for an account."

    def add_arguments(self, parser):
        parser.add_argument("email")

    def handle(self, email, **options):
        value = secrets.token_urlsafe(32)
        token = Token(
            type=Token.Type.ACCESS_TOKEN,
            user=User.objects.get(email=email),
            expires_at=timezone.now() + timezone.timedelta(hours=1),
        )
        token.set_value(value)
        token.save()
        self.stdout.write(value)
