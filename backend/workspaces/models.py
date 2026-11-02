import secrets
import string

from django.conf import settings
from django.db import models

WORKSPACE_NAME_MAX_LENGTH = 200
PATH_MAX_LENGTH = 500
FILE_MAX_BYTES = 10 * 1024 * 1024
# Mirrors createUniqueNoteId in src/domain/notes/ids.ts.
WORKSPACE_ID_ALPHABET = "".join(
    char for char in string.ascii_letters + string.digits if char not in "0OIl"
)
WORKSPACE_ID_LENGTH = 10


def workspace_id():
    return "".join(secrets.choice(WORKSPACE_ID_ALPHABET) for _ in range(WORKSPACE_ID_LENGTH))


class Workspace(models.Model):
    id = models.CharField(primary_key=True, max_length=20, default=workspace_id, editable=False)
    name = models.CharField(max_length=WORKSPACE_NAME_MAX_LENGTH)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    head = models.ForeignKey(
        "Revision", null=True, blank=True, on_delete=models.RESTRICT, related_name="+"
    )

    class Meta:
        ordering = ["created_at", "id"]


class Blob(models.Model):
    hash = models.CharField(primary_key=True, max_length=64)
    content = models.BinaryField()


class Revision(models.Model):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="revisions")
    # RESTRICT keeps history intact while still letting a workspace delete cascade through it.
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.RESTRICT)
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL
    )
    created_at = models.DateTimeField(auto_now_add=True)
    message = models.TextField(blank=True)


class RevisionChange(models.Model):
    revision = models.ForeignKey(Revision, on_delete=models.CASCADE, related_name="changes")
    path = models.CharField(max_length=PATH_MAX_LENGTH)
    # A null blob records a deletion.
    blob = models.ForeignKey(Blob, null=True, on_delete=models.PROTECT)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["revision", "path"], name="one_change_per_revision_path"
            )
        ]


class WorkspaceFile(models.Model):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="files")
    path = models.CharField(max_length=PATH_MAX_LENGTH)
    blob = models.ForeignKey(Blob, on_delete=models.PROTECT)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "path"], name="one_file_per_workspace_path"
            ),
        ]
