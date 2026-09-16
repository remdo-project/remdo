import json

from accounts.models import User
from django.core.management.base import BaseCommand
from documents.models import Document


class Command(BaseCommand):
    help = "Internal fixture setup: create fresh document metadata and print its ID."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)
        parser.add_argument("--id")
        parser.add_argument("--title", required=True)

    def handle(self, email, id, title, **options):
        fields = {"id": id} if id is not None else {}
        document = Document.objects.create(
            owner=User.objects.get(email=email), title=title, **fields
        )
        self.stdout.write(json.dumps({"id": document.id}))
