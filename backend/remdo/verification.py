from .development import *  # noqa: F403

# Verification authenticates synthetic users without production hashing cost.
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
