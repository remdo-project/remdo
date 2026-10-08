from django.db import migrations


def verify_existing_addresses(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    EmailAddress = apps.get_model("account", "EmailAddress")
    unlisted = User.objects.exclude(email="").exclude(pk__in=EmailAddress.objects.values("user_id"))
    taken = set(EmailAddress.objects.values_list("email", flat=True))
    for user in unlisted:
        email = user.email.lower()
        if email not in taken:
            EmailAddress.objects.create(user=user, email=email, primary=True, verified=True)
            taken.add(email)


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0003_productupdatesubscription"),
        ("account", "0009_emailaddress_unique_primary_email"),
    ]

    operations = [migrations.RunPython(verify_existing_addresses, migrations.RunPython.noop)]
