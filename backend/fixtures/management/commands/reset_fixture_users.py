from accounts.models import User
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Delete the named fixture accounts and their related database records."

    def add_arguments(self, parser):
        parser.add_argument("--email", action="append", required=True)

    def handle(self, email, **options):
        User.objects.filter(email__in=email).delete()
