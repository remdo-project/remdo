"""One production secret bundle, shared by startup and management commands."""

import json
import os
import secrets
import tempfile
from pathlib import Path

import psycopg
from django.core.exceptions import ImproperlyConfigured

FIELDS = ("auth_secret", "collaboration_secret")
ENVIRONMENT_VARIABLES = {
    "auth_secret": "AUTH_SECRET",
    "collaboration_secret": "COLLAB_INTERNAL_SECRET",
}


def complete(values):
    return isinstance(values, dict) and all(
        isinstance(values.get(key), str) and len(values[key].strip()) >= 32 for key in FIELDS
    )


def read_environment_secrets():
    values = {
        key: os.environ.get(variable, "").strip() for key, variable in ENVIRONMENT_VARIABLES.items()
    }
    if not any(values.values()):
        return None
    if not complete(values):
        raise ImproperlyConfigured(
            f"Set both {' and '.join(ENVIRONMENT_VARIABLES.values())} to at least 32 characters."
        )
    return values


def read_secrets(path):
    try:
        values = json.loads(path.read_text())
        if not complete(values):
            raise ValueError
    except (ValueError, OSError) as error:
        raise ImproperlyConfigured(
            "Cannot load secrets.json; restore the complete secret bundle."
        ) from error
    if path.stat().st_mode & 0o077:
        raise ImproperlyConfigured("secrets.json must be private (chmod 600).")
    return {key: values[key] for key in FIELDS}


def load_secrets(data_dir):
    data_dir = Path(data_dir)
    path = data_dir / "secrets.json"
    if (values := read_environment_secrets()) is not None:
        return values
    if path.exists():
        return read_secrets(path)
    if (data_dir / "django.sqlite3").exists() or database_has_data():
        raise ImproperlyConfigured(
            "Missing secrets.json for an existing dataset; restore its secret bundle."
        )
    values = {key: secrets.token_urlsafe(48) for key in FIELDS}
    # Publish only a complete, private file; concurrent first readers reuse the winner.
    data_dir.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(dir=data_dir)
    try:
        with os.fdopen(fd, "w") as stream:
            json.dump(values, stream)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        try:
            os.link(temporary, path)
        except FileExistsError:
            pass
    finally:
        os.unlink(temporary)
    return read_secrets(path)


def database_has_data():
    # Settings are still loading; the ORM cannot be initialized yet.
    if not (url := os.environ.get("DATABASE_URL")):
        return False
    with psycopg.connect(url) as connection:
        return connection.execute(
            "SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public')"
        ).fetchone()[0]
