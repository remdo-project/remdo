from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models, router, transaction
from django.db.models.signals import post_save
from django.dispatch import receiver


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email, password=None, **extra_fields):
        user = self.model(email=self.normalize_email(email).lower(), **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        return self.create_user(email, password, is_staff=True, is_superuser=True, **extra_fields)


class User(AbstractUser):
    username = None
    email = models.EmailField(unique=True)
    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []
    objects = UserManager()

    def save(self, **kwargs):
        using = kwargs.get("using") or router.db_for_write(type(self), instance=self)
        with transaction.atomic(using=using):
            super().save(**kwargs)

    def clean(self):
        super().clean()
        self.email = self.email.lower()


@receiver(post_save, sender=User)
def create_starter_document(sender, instance, created, raw, using, **kwargs):
    if created and not raw:
        from documents.models import Document

        Document.objects.using(using).create(owner=instance, title="New Document")
