import secrets
import string

from django.conf import settings
from django.db import models
from django.db.models import Q

DOCUMENT_TITLE_MAX_LENGTH = 500
# Mirrors createUniqueNoteId in src/domain/notes/ids.ts.
DOCUMENT_ID_ALPHABET = "".join(
    char for char in string.ascii_letters + string.digits if char not in "0OIl"
)
DOCUMENT_ID_LENGTH = 10


def document_id():
    return "".join(secrets.choice(DOCUMENT_ID_ALPHABET) for _ in range(DOCUMENT_ID_LENGTH))


class DocumentQuerySet(models.QuerySet):
    def accessible_to(self, user):
        return self.filter(Q(owner=user) | Q(grants__user=user)).distinct()


class Document(models.Model):
    id = models.CharField(primary_key=True, max_length=20, default=document_id, editable=False)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    title = models.CharField(max_length=DOCUMENT_TITLE_MAX_LENGTH, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    objects = DocumentQuerySet.as_manager()

    class Meta:
        ordering = ["created_at", "id"]


class DocumentContent(models.Model):
    document = models.OneToOneField(Document, primary_key=True, on_delete=models.CASCADE)
    state = models.BinaryField()


class DocumentGrant(models.Model):
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name="grants")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["document", "user"], name="one_grant_per_document_user")
        ]
