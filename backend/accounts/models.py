from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models, transaction
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email, password=None, **extra_fields):
        user = self.model(email=self.normalize_email(email).lower(), **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    @transaction.atomic
    def create_superuser(self, email, password=None, **extra_fields):
        user = self.create_user(email, password, is_staff=True, is_superuser=True, **extra_fields)
        record_verified_address(user)
        return user


class User(AbstractUser):
    username = None
    email = models.EmailField(unique=True)
    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []
    objects = UserManager()

    @property
    def is_administrator(self):
        return self.is_staff or self.is_superuser

    def save(self, **kwargs):
        with transaction.atomic(using=kwargs.get("using")):
            super().save(**kwargs)

    def clean(self):
        super().clean()
        self.email = self.email.lower()


def record_verified_address(user):
    """An operator vouches for the address, so mandatory verification cannot lock it out."""
    from allauth.account.models import EmailAddress

    if not EmailAddress.objects.filter(email=user.email).exclude(user=user).exists():
        EmailAddress.objects.get_or_create(
            user=user, email=user.email, defaults={"primary": True, "verified": True}
        )


@receiver(post_save, sender=User)
def create_starter_document(sender, instance, created, raw, **kwargs):
    if created and not raw:
        from documents.models import Document

        Document.objects.create(owner=instance, title="New Document")


class SigningKey(models.Model):
    """The delegated-access ID-token signing key, encrypted with the auth secret."""

    encrypted_pem = models.TextField()


class ProductUpdateSubscription(models.Model):
    email = models.EmailField(unique=True)
    requested_at = models.DateTimeField(default=timezone.now, editable=False)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    withdrawn_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return self.email
