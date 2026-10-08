from allauth.idp.oidc.models import Client
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import ProductUpdateSubscription, User, record_verified_address


@admin.register(User)
class AccountAdmin(UserAdmin):
    ordering = ("email",)
    list_display = ("email", "is_staff", "is_active")
    search_fields = ("email",)
    fieldsets = None
    add_fieldsets = ((None, {"fields": ("email", "password1", "password2")}),)

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        if not change:
            record_verified_address(obj)


@admin.register(ProductUpdateSubscription)
class ProductUpdateSubscriptionAdmin(admin.ModelAdmin):
    list_display = ("email", "requested_at", "confirmed_at", "withdrawn_at")
    list_filter = (
        ("confirmed_at", admin.EmptyFieldListFilter),
        ("withdrawn_at", admin.EmptyFieldListFilter),
    )
    search_fields = ("email",)
    ordering = ("-requested_at",)
    readonly_fields = ("email", "requested_at", "confirmed_at")

    def has_add_permission(self, request):
        return False


# Delegated access admits only applications identified by client metadata
# documents, so operators do not register clients.
admin.site.unregister(Client)
