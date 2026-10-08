import os

# Fixture credentials enable Google sign-in; tests stub Google's endpoints.
os.environ["GOOGLE_CLIENT_ID"] = "test-google-client-id"
os.environ["GOOGLE_CLIENT_SECRET"] = "test-google-client-secret"
# Tests fail on purpose; their errors stay out of the operator's project.
os.environ["SENTRY_DSN"] = ""
# Tests stay independent of a configured mail host and backend.
os.environ["EMAIL_HOST"] = ""
os.environ["EMAIL_BACKEND"] = ""
# Verification never emits product analytics even if the host environment does.
os.environ["UMAMI_WEBSITE_ID"] = ""

from . import base  # noqa: E402
from .development import *  # noqa: E402, F403

# Tests stay independent of a local demo recording.
HOME_VIDEO_URL = base.HOME_VIDEO_URL

# Tests authenticate synthetic users without production hashing cost.
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

# manage.py runs from the repository root, where Django's discovery finds no
# tests and reports success. Default to the application labels so an invocation
# without one cannot silently verify nothing; Django's own parser decides what
# counts as a label, so option values are not mistaken for one.
TEST_RUNNER = "remdo.testing.DefaultLabelTestRunner"

from django.test.runner import DiscoverRunner  # noqa: E402

DEFAULT_TEST_LABELS = ("accounts", "documents", "fixtures", "remdo")


class DefaultLabelTestRunner(DiscoverRunner):
    def build_suite(self, test_labels=None, **kwargs):
        return super().build_suite(tuple(test_labels or DEFAULT_TEST_LABELS), **kwargs)
