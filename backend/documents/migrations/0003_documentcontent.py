import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("documents", "0002_documentgrant")]

    operations = [
        migrations.CreateModel(
            name="DocumentContent",
            fields=[
                (
                    "document",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        primary_key=True,
                        serialize=False,
                        to="documents.document",
                    ),
                ),
                ("state", models.BinaryField()),
            ],
        ),
    ]
