"""One persistent production secret bundle, shared by startup and management commands."""

import json
import os
import secrets
import subprocess
import tempfile
from pathlib import Path

import psycopg
from django.core.exceptions import ImproperlyConfigured

FIELDS = ("auth_secret", "ysweet_auth_key", "ysweet_server_token")


def read_secrets(path):
    try:
        values = json.loads(path.read_text())
        if not isinstance(values, dict) or any(
            not isinstance(values.get(key), str) or len(values[key].strip()) < 32 for key in FIELDS
        ):
            raise ValueError
    except (ValueError, OSError) as error:
        raise ImproperlyConfigured(
            "Cannot load secrets.json; restore the complete secret bundle."
        ) from error
    if path.stat().st_mode & 0o077:
        raise ImproperlyConfigured("secrets.json must be private (chmod 600).")
    return values


def load_secrets(data_dir):
    data_dir = Path(data_dir)
    path = data_dir / "secrets.json"
    if path.exists():
        return read_secrets(path)
    if (
        (data_dir / "django.sqlite3").exists()
        or (data_dir / "remdo.sqlite").exists()
        or database_has_data()
        or ((data_dir / "collab").exists() and any((data_dir / "collab").iterdir()))
    ):
        raise ImproperlyConfigured(
            "Missing secrets.json for an existing dataset; restore its secret bundle."
        )
    try:
        result = subprocess.run(
            ["y-sweet", "gen-auth", "--json"], capture_output=True, text=True, check=True
        )
        pair = json.loads(result.stdout)
        values = {
            "auth_secret": secrets.token_urlsafe(48),
            "ysweet_auth_key": pair["private_key"],
            "ysweet_server_token": pair["server_token"],
        }
    except (OSError, subprocess.SubprocessError, ValueError, KeyError) as error:
        raise ImproperlyConfigured("Y-Sweet secret generation failed.") from error
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
