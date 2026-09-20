from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models, router, transaction


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
        from documents.models import Document

        creating = self._state.adding
        using = kwargs.get("using") or router.db_for_write(type(self), instance=self)
        with transaction.atomic(using=using):
            super().save(**kwargs)
            if creating:
                Document.objects.using(using).create(owner=self, title="New Document")

    def clean(self):
        super().clean()
        self.email = self.email.lower()
