import secrets
import string

from django.conf import settings
from django.db import models
from django.db.models import Exists, OuterRef
from django.db.models.signals import post_delete, pre_delete
from django.dispatch import receiver
from django.utils import timezone

WORKSPACE_NAME_MAX_LENGTH = 200
PATH_MAX_LENGTH = 200
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
        permissions = [("use_workspaces", "Can use workspaces")]


class Blob(models.Model):
    hash = models.CharField(primary_key=True, max_length=64)
    content = models.BinaryField()

    class Meta:
        default_permissions = ()


class Revision(models.Model):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="revisions")
    # RESTRICT keeps history intact while still letting a workspace delete cascade through it.
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.RESTRICT)
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL
    )
    created_at = models.DateTimeField(auto_now_add=True)
    changed_at = models.DateTimeField(default=timezone.now)
    # Only the head can be open, taking a live document's further saves until it is sealed.
    sealed = models.BooleanField(default=True)
    message = models.TextField(blank=True)

    class Meta:
        default_permissions = ()


class RevisionChange(models.Model):
    revision = models.ForeignKey(Revision, on_delete=models.CASCADE, related_name="changes")
    path = models.CharField(max_length=PATH_MAX_LENGTH)
    # A null blob records a deletion.
    blob = models.ForeignKey(Blob, null=True, on_delete=models.PROTECT)

    class Meta:
        default_permissions = ()
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
        default_permissions = ()
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "path"], name="one_file_per_workspace_path"
            ),
        ]


class DocumentState(models.Model):
    """A workspace document's Yjs state, cached beside the file it was saved as."""

    workspace = models.OneToOneField(
        Workspace, primary_key=True, on_delete=models.CASCADE, related_name="+"
    )
    state = models.BinaryField()
    # The blob hash of the README version the state builds on; null when it builds on a missing
    # file. Not a reference, so replaced content can be dropped while the row still names it.
    version = models.CharField(max_length=64, null=True, blank=True)

    class Meta:
        default_permissions = ()


@receiver(pre_delete, sender=Workspace)
def _remember_workspace_blobs(sender, instance, **kwargs):
    instance._blob_hashes = set(
        RevisionChange.objects.filter(revision__workspace=instance)
        .exclude(blob=None)
        .values_list("blob_id", flat=True)
    )


@receiver(post_delete, sender=Workspace)
def _delete_orphaned_blobs(sender, instance, **kwargs):
    """Delete the content a deleted workspace held that no other workspace references.

    Blobs are shared across workspaces, so deleting a workspace's rows alone leaves its
    content behind. Its revisions and files are already gone when this runs.
    """
    delete_unreferenced_blobs(getattr(instance, "_blob_hashes", ()))


def delete_unreferenced_blobs(hashes):
    Blob.objects.filter(hash__in=hashes).only("hash").exclude(
        Exists(RevisionChange.objects.filter(blob=OuterRef("pk")))
    ).exclude(Exists(WorkspaceFile.objects.filter(blob=OuterRef("pk")))).delete()
