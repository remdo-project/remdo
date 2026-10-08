from django.db import migrations


def verify_existing_addresses(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    EmailAddress = apps.get_model("account", "EmailAddress")
    unlisted = (
        User.objects.exclude(email="")
        .exclude(pk__in=EmailAddress.objects.values("user_id"))
        .exclude(email__in=EmailAddress.objects.values("email"))
    )
    EmailAddress.objects.bulk_create(
        EmailAddress(user=user, email=user.email.lower(), primary=True, verified=True)
        for user in unlisted
    )


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0003_productupdatesubscription"),
        ("account", "0009_emailaddress_unique_primary_email"),
    ]

    operations = [migrations.RunPython(verify_existing_addresses, migrations.RunPython.noop)]
