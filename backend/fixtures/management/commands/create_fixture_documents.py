import json

from accounts.models import User
from django.core.management.base import BaseCommand
from django.db import transaction
from documents.models import Document


class Command(BaseCommand):
    help = "Internal fixture setup: create fresh document metadata and print IDs in input order."

    def add_arguments(self, parser):
        parser.add_argument("documents", type=json.loads)

    @transaction.atomic
    def handle(self, documents, **options):
        ids = []
        for document in documents:
            fields = {"id": document["id"]} if "id" in document else {}
            created = Document.objects.create(
                owner=User.objects.get(email=document["email"]), title=document["title"], **fields
            )
            ids.append(created.id)
        self.stdout.write(json.dumps(ids))
