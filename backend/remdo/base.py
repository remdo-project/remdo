import os
from pathlib import Path
from urllib.parse import urlsplit

import dj_database_url
from django.core.exceptions import ImproperlyConfigured


def required(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise ImproperlyConfigured(f"{name} is required.")
    return value


DEBUG = False
OPENAI_APPS_CHALLENGE = os.environ.get("OPENAI_APPS_CHALLENGE", "")
BUILD_REVISION = os.environ.get("BUILD_REVISION", "").strip()
DATA_DIR = Path(required("DATA_DIR")).resolve()
DATA_DIR.mkdir(parents=True, exist_ok=True)
APP_ORIGIN = required("APP_ORIGIN")
try:
    origin = urlsplit(APP_ORIGIN)
    if (
        origin.scheme not in {"http", "https"}
        or not origin.hostname
        or origin.username is not None
        or origin.password is not None
        or APP_ORIGIN != f"{origin.scheme}://{origin.netloc}"
    ):
        raise ValueError
    cookie_namespace = origin.port or (443 if origin.scheme == "https" else 80)
except ValueError as error:
    raise ImproperlyConfigured("APP_ORIGIN must be an exact HTTP(S) origin.") from error

SENTRY_DSN = os.environ.get("SENTRY_DSN", "")
UMAMI_WEBSITE_ID = os.environ.get("UMAMI_WEBSITE_ID", "").strip()
if SENTRY_DSN:
    from . import error_reporting

    error_reporting.start(SENTRY_DSN, BUILD_REVISION, origin.hostname)

CSRF_TRUSTED_ORIGINS = [APP_ORIGIN]
COLLAB_SERVER_ORIGIN = f"http://127.0.0.1:{required('COLLAB_SERVER_PORT')}"
ALLOWED_HOSTS = [origin.hostname]
SESSION_COOKIE_NAME = f"remdo_session_{cookie_namespace}"
CSRF_COOKIE_NAME = f"remdo_csrf_{cookie_namespace}"
SESSION_COOKIE_SECURE = origin.scheme == "https"
CSRF_COOKIE_SECURE = SESSION_COOKIE_SECURE
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "allauth",
    "allauth.account",
    "allauth.socialaccount",
    "allauth.headless",
    "allauth.idp.oidc",
    "rest_framework",
    "drf_spectacular",
    "accounts",
    "documents",
]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "allauth.account.middleware.AccountMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
ROOT_URLCONF = "remdo.urls"
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [Path(__file__).resolve().parents[1] / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                "remdo.context_processors.analytics",
            ]
        },
    }
]
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": DATA_DIR / "django.sqlite3",
        "OPTIONS": {"timeout": 20, "transaction_mode": "IMMEDIATE"},
    }
}
if database_url := os.environ.get("DATABASE_URL"):
    # A connection per request costs PostgreSQL more CPU than the queries do.
    DATABASES["default"] = dj_database_url.parse(
        database_url, conn_max_age=600, conn_health_checks=True
    )
    if DATABASES["default"]["ENGINE"] != "django.db.backends.postgresql":
        raise ImproperlyConfigured("DATABASE_URL must select PostgreSQL.")
AUTH_USER_MODEL = "accounts.User"
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
STATIC_URL = "/django-static/"
STATIC_ROOT = Path(__file__).resolve().parents[2] / "static"
FRONTEND_MANIFEST = Path(__file__).resolve().parents[2] / "dist" / ".vite" / "manifest.json"
FRONTEND_USE_SOURCE = False

AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
    "allauth.account.auth_backends.AuthenticationBackend",
]
ACCOUNT_USER_MODEL_USERNAME_FIELD = None
ACCOUNT_LOGIN_METHODS = {"email"}
ACCOUNT_SESSION_REMEMBER = True
ACCOUNT_RATE_LIMITS = {"product_update_subscription": "20/h/ip"}
# Signup never collects a password: one registered ahead of its mailbox owner
# would stay valid after the owner verifies the address.
ACCOUNT_SIGNUP_FIELDS = ["email*"]
ACCOUNT_FORMS = {"login": "accounts.forms.PasswordLoginForm"}
ACCOUNT_EMAIL_VERIFICATION = "none"
ACCOUNT_ADAPTER = "accounts.adapters.AccountAdapter"
SOCIALACCOUNT_ADAPTER = "accounts.adapters.SocialAccountAdapter"
LOGIN_REDIRECT_URL = "/"
HEADLESS_CLIENTS = ("browser",)
HEADLESS_ADAPTER = "accounts.adapters.HeadlessAdapter"
HEADLESS_SERVE_SPECIFICATION = True
HOME_VIDEO_URL = os.environ.get("HOME_VIDEO_URL", "").strip()
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()
if bool(GOOGLE_CLIENT_ID) != bool(GOOGLE_CLIENT_SECRET):
    raise ImproperlyConfigured("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together.")
if GOOGLE_CLIENT_ID:
    INSTALLED_APPS.append("allauth.socialaccount.providers.google")
    SOCIALACCOUNT_PROVIDERS = {
        "google": {
            "APPS": [{"client_id": GOOGLE_CLIENT_ID, "secret": GOOGLE_CLIENT_SECRET}],
            "SCOPE": ["openid", "email", "profile"],
        }
    }
EMAIL_SIGNUP_ENABLED = False
# Verification of an address by code is what grants access to a new account, so
# sign-in by code, signup, and mandatory verification enable together.
EMAIL_SIGNUP_SETTINGS = {
    "EMAIL_SIGNUP_ENABLED": True,
    "ACCOUNT_LOGIN_BY_CODE_ENABLED": True,
    "ACCOUNT_LOGIN_BY_CODE_TIMEOUT": 600,
    "ACCOUNT_EMAIL_VERIFICATION": "mandatory",
    "SOCIALACCOUNT_EMAIL_VERIFICATION": "none",
    "ACCOUNT_EMAIL_VERIFICATION_BY_CODE_ENABLED": True,
    "ACCOUNT_EMAIL_VERIFICATION_SUPPORTS_RESEND": True,
}
EMAIL_HOST = os.environ.get("EMAIL_HOST", "").strip()
if EMAIL_HOST:
    DEFAULT_FROM_EMAIL = required("DEFAULT_FROM_EMAIL")
    try:
        EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "").strip() or 587)
        if not 1 <= EMAIL_PORT <= 65535:
            raise ValueError
    except ValueError as error:
        raise ImproperlyConfigured("EMAIL_PORT must be a port number.") from error
    EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "").strip()
    EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "").strip()
    EMAIL_USE_SSL = EMAIL_PORT in {465, 2465}
    EMAIL_USE_TLS = not EMAIL_USE_SSL
    EMAIL_TIMEOUT = 10
    globals().update(EMAIL_SIGNUP_SETTINGS)
IDP_OIDC_ADAPTER = "accounts.delegated.OIDCAdapter"
IDP_OIDC_CIMD_ENABLED = True
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "accounts.delegated.DelegatedAccessAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}
SPECTACULAR_SETTINGS = {
    "TITLE": "RemDo application API",
    "VERSION": "1",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
}

PUBLIC_PAGES_DIR = Path(__file__).resolve().parents[2] / "content" / "pages"
