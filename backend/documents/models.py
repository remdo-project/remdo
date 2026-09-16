import secrets
import string

from django.conf import settings
from django.db import models


def document_id():
    # Match the canonical note-ID alphabet and length ceiling; 20 characters provide 119 bits.
    return "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(20))


class Document(models.Model):
    id = models.CharField(primary_key=True, max_length=20, default=document_id, editable=False)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    title = models.CharField(max_length=500, blank=True)
    kind = models.CharField(
        max_length=8, choices=[("document", "Document"), ("home", "Home")], default="document"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["owner"], condition=models.Q(kind="home"), name="one_home_per_user"
            )
        ]
