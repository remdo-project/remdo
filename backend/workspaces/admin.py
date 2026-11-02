from django.contrib import admin

from .models import Workspace


@admin.register(Workspace)
class WorkspaceAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "owner")
    list_select_related = ("owner",)
    search_fields = ("name", "owner__email")
    readonly_fields = ("head",)
