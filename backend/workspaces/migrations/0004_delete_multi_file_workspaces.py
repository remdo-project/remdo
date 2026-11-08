from django.db import migrations


def delete_workspaces(apps, schema_editor):
    """Delete every workspace: they hold only testers' data from before workspaces held one file.

    Historical models skip the signals that clean up orphaned content, so blobs go explicitly.
    """
    apps.get_model("workspaces", "Workspace").objects.all().delete()
    apps.get_model("workspaces", "Blob").objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [("workspaces", "0003_drop_unused_permissions")]

    operations = [migrations.RunPython(delete_workspaces, migrations.RunPython.noop)]
