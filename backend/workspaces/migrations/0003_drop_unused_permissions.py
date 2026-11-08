from django.db import migrations

HISTORY_MODELS = ("blob", "revision", "revisionchange", "workspacefile")


def delete_permissions(apps, schema_editor):
    # Django adds permissions for new models but never removes those a model stops declaring.
    Permission = apps.get_model("auth", "Permission")
    Permission.objects.filter(
        content_type__app_label="workspaces", content_type__model__in=HISTORY_MODELS
    ).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("auth", "0012_alter_user_first_name_max_length"),
        ("contenttypes", "0002_remove_content_type_name"),
        ("workspaces", "0002_use_workspaces_permission"),
    ]

    operations = [
        *(
            migrations.AlterModelOptions(name=model, options={"default_permissions": ()})
            for model in HISTORY_MODELS
        ),
        migrations.RunPython(delete_permissions, migrations.RunPython.noop),
    ]
