import os
from pathlib import Path
from urllib.parse import urlsplit

from django.core.exceptions import ImproperlyConfigured


def required(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise ImproperlyConfigured(f"{name} is required.")
    return value


DEBUG = False
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

CSRF_TRUSTED_ORIGINS = [APP_ORIGIN]
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
    "allauth.headless",
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
        "DIRS": [Path(__file__).resolve().parents[1] / "accounts" / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
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

AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
    "allauth.account.auth_backends.AuthenticationBackend",
]
ACCOUNT_USER_MODEL_USERNAME_FIELD = None
ACCOUNT_LOGIN_METHODS = {"email"}
ACCOUNT_SESSION_REMEMBER = True
ACCOUNT_SIGNUP_FIELDS = ["email*", "password1*", "password2*"]
ACCOUNT_EMAIL_VERIFICATION = "none"
ACCOUNT_ADAPTER = "accounts.adapters.AccountAdapter"
LOGIN_REDIRECT_URL = "/"
HEADLESS_CLIENTS = ("browser",)
HEADLESS_ADAPTER = "accounts.adapters.HeadlessAdapter"
HEADLESS_SERVE_SPECIFICATION = True
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"],
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
