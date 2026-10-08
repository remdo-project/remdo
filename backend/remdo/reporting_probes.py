"""Production reporting scenarios executed in fresh processes by ConfigurationTests."""

import io
import json
import os
import sys

import django
from django.conf import settings
from django.core.exceptions import SuspiciousOperation
from django.core.handlers.wsgi import WSGIHandler
from django.core.management import call_command
from django.http import HttpResponse
from django.test import Client, override_settings
from django.urls import path
from django.views.decorators.csrf import csrf_exempt

LOCAL_VALUE = "private-local-value"
RESPONSE_BODY = "private-response-body"


@csrf_exempt
def fail(request, document):
    confidential_local = LOCAL_VALUE  # noqa: F841
    raise RuntimeError("reported-exception-message")


@csrf_exempt
def suspicious(request, document):
    raise SuspiciousOperation("reported-suspicious-request")


@csrf_exempt
def status(request, code, document):
    return HttpResponse(RESPONSE_BODY, status=code)


def diagnostic(request, document):
    import sentry_sdk

    sentry_sdk.capture_exception(RuntimeError("synthetic caught diagnostic"))
    return HttpResponse(RESPONSE_BODY, status=410)


urlpatterns = [
    path("fail/<str:document>", fail),
    path("suspicious/<str:document>", suspicious),
    path("status/<int:code>/<str:document>", status),
    path("diagnostic/<str:document>", diagnostic),
]


def exceptions():
    body = b"private-form-field=private-form-value"
    environ = {
        "REQUEST_METHOD": "POST",
        "QUERY_STRING": "code=private-query-value",
        "SERVER_NAME": "remdo.example",
        "SERVER_PORT": "443",
        "REMOTE_ADDR": "198.51.100.7",
        "wsgi.url_scheme": "https",
        "CONTENT_TYPE": "application/x-www-form-urlencoded",
        "CONTENT_LENGTH": str(len(body)),
        "HTTP_HOST": "remdo.example",
        "HTTP_USER_AGENT": "reporting-test-agent",
        "HTTP_COOKIE": "private-cookie-name=private-cookie-value",
        "HTTP_AUTHORIZATION": "Bearer private-token",
        "HTTP_X_REMDO_COLLABORATION_SECRET": "private-collaboration-secret",
    }
    statuses = []
    with override_settings(ROOT_URLCONF=__name__):
        for route in ("/fail/document-id", "/suspicious/document-id"):
            request = {**environ, "PATH_INFO": route, "wsgi.input": io.BytesIO(body)}
            WSGIHandler()(request, lambda status, headers: statuses.append(status))
    return statuses


def http_errors():
    client = Client(enforce_csrf_checks=True, raise_request_exception=False)
    options = {
        "secure": True,
        "HTTP_HOST": "remdo.example",
        "HTTP_ORIGIN": "https://remdo.example",
        "HTTP_USER_AGENT": "reporting-test-agent",
        "HTTP_AUTHORIZATION": "Bearer private-token",
    }
    with override_settings(ROOT_URLCONF=__name__):
        statuses = [
            client.get(f"/status/{code}/private-document?code=private-code", **options).status_code
            for code in (200, 201, 204, 302, 304, 400, 401, 403, 404, 410, 429, 500, 503, 599)
        ]
        client.get("/status/401/another-private-document", **options)
        client.get("/private-bookmark?secret=private-query", **options)
        client.post("/diagnostic/private-document", {"private-body": "private-value"}, **options)
        client.get("/diagnostic/private-document", **options)

    # Exercise a real handled authentication failure without an external provider
    # request or frontend build. Allauth's session and provider lookup use the DB.
    call_command("migrate", interactive=False, stdout=io.StringIO())
    with override_settings(FRONTEND_USE_SOURCE=True):
        callback = client.get(
            "/accounts/google/login/callback/?code=private-code&state=private-state", **options
        )
    return {"statuses": statuses, "callback_status": callback.status_code}


def disabled():
    with override_settings(ROOT_URLCONF=__name__):
        response = Client().get("/status/503/document", secure=True, HTTP_HOST="remdo.example")
    return {
        "status": response.status_code,
        "loaded": {
            name: name in sys.modules
            for name in ("remdo.error_reporting", "remdo.http_reporting", "sentry_sdk")
        },
    }


if __name__ == "__main__":
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "remdo.settings")
    django.setup()
    result = {"exceptions": exceptions, "http-errors": http_errors, "disabled": disabled}[
        sys.argv[1]
    ]()
    if settings.SENTRY_DSN:
        import sentry_sdk

        sentry_sdk.flush()
    print(json.dumps(result))
