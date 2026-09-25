from allauth.idp.oidc.models import Client
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.register(User)
class AccountAdmin(UserAdmin):
    ordering = ("email",)
    list_display = ("email", "is_staff", "is_active")
    search_fields = ("email",)
    fieldsets = None
    add_fieldsets = ((None, {"fields": ("email", "password1", "password2")}),)


# Delegated access admits only applications identified by client metadata
# documents, so operators do not register clients.
admin.site.unregister(Client)
