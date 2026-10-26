"""Production reporting scenarios executed in fresh processes by ConfigurationTests."""

import asyncio
import io
import json
import os
import sys
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import django
import httpx2
from asgiref.sync import sync_to_async
from django.conf import settings
from django.core.exceptions import SuspiciousOperation
from django.core.management import call_command
from django.http import HttpResponse, StreamingHttpResponse
from django.test import override_settings
from django.urls import path, re_path
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


@csrf_exempt
def unavailable(request, **route_values):
    return HttpResponse(RESPONSE_BODY, status=503)


def diagnostic(request, document):
    import sentry_sdk

    sentry_sdk.capture_exception(RuntimeError("synthetic caught diagnostic"))
    return HttpResponse(RESPONSE_BODY, status=410)


def streaming(request, document):
    async def chunks():
        yield RESPONSE_BODY
        raise RuntimeError("reported-streaming-exception")

    return StreamingHttpResponse(chunks())


urlpatterns = [
    path("", unavailable),
    re_path(r"^pages/(?P<slug>[a-z-]+)/$", unavailable),
    path("fail/<str:document>", fail),
    path("suspicious/<str:document>", suspicious),
    path("status/<int:code>/<str:document>", status),
    path("diagnostic/<str:document>", diagnostic),
    path("streaming/<str:document>", streaming),
]


@asynccontextmanager
async def http_client():
    from .asgi import application

    async with application.router.lifespan_context(application):
        async with httpx2.AsyncClient(
            transport=httpx2.ASGITransport(
                application, raise_app_exceptions=False, client=("198.51.100.7", 12345)
            ),
            base_url="https://remdo.example",
            headers={
                "Origin": "https://remdo.example",
                "User-Agent": "reporting-test-agent",
                "Authorization": "Bearer private-token",
            },
        ) as client:
            yield client


async def exceptions():
    statuses = []
    async with http_client() as client:
        with override_settings(ROOT_URLCONF=__name__):
            for route in ("/fail/document-id", "/suspicious/document-id"):
                response = await client.post(
                    route + "?code=private-query-value",
                    headers={
                        "Cookie": "private-cookie-name=private-cookie-value",
                        "X-Remdo-Collaboration-Secret": "private-collaboration-secret",
                    },
                    data={"private-form-field": "private-form-value"},
                )
                statuses.append(f"{response.status_code} {response.reason_phrase}")
    return statuses


async def http_errors():
    # Allauth's session and provider lookup use the DB.
    await sync_to_async(call_command)("migrate", interactive=False, stdout=io.StringIO())
    async with http_client() as client:
        with override_settings(ROOT_URLCONF=__name__):
            statuses = [
                (await client.get(f"/status/{code}/private-document?code=private-code")).status_code
                for code in (200, 201, 204, 302, 304, 400, 401, 403, 404, 410, 429, 500, 503, 599)
            ]
            await client.get("/status/503/another-private-document")
            await client.get("/")
            await client.get("/pages/private-page/")
            await client.get("/private-bookmark?secret=private-query")
            await client.post(
                "/diagnostic/private-document", data={"private-body": "private-value"}
            )
            await client.get("/diagnostic/private-document")

        with override_settings(FRONTEND_USE_SOURCE=True):
            callback_statuses = [
                (
                    await client.get(
                        "/accounts/google/login/callback/?code=private-code&state=private-state"
                    )
                ).status_code
            ]
            client.cookies.set(settings.SESSION_COOKIE_NAME, "private-session-cookie")
            callback_statuses.append(
                (
                    await client.get(
                        "/accounts/google/login/callback/",
                        params={
                            "error": "private-provider-error",
                            "error_description": "private-provider-description",
                        },
                    )
                ).status_code
            )
            client.cookies.delete(settings.SESSION_COOKIE_NAME)
            callback_statuses.append(
                (await client.get("/accounts/google/login/callback/")).status_code
            )
    return {"statuses": statuses, "callback_statuses": callback_statuses}


async def disabled():
    async with http_client() as client:
        with override_settings(ROOT_URLCONF=__name__):
            response = await client.get("/status/503/document")
    return {
        "status": response.status_code,
        "loaded": {
            name: name in sys.modules
            for name in ("remdo.error_reporting", "remdo.http_reporting", "sentry_sdk")
        },
    }


async def streaming_failure():
    async with http_client() as client:
        with override_settings(ROOT_URLCONF=__name__):
            response = await client.get("/streaming/private-document?secret=private-query")
    return [f"{response.status_code} {response.reason_phrase}"]


async def mcp_failure():
    async with http_client() as client:
        with patch(
            "mcp_server.server.database_call",
            new=AsyncMock(side_effect=RuntimeError("reported-mcp-exception")),
        ):
            response = await client.post(
                "/mcp?code=private-query-value",
                headers={
                    "Cookie": "private-cookie-name=private-cookie-value",
                    "X-Remdo-Collaboration-Secret": "private-collaboration-secret",
                },
                data={"private-form-field": "private-form-value"},
            )
        auth_status = response.status_code
        with patch(
            "mcp_server.server.database_call",
            new=AsyncMock(side_effect=[object(), RuntimeError("reported-tool-exception")]),
        ):
            tool_response = await client.post(
                "/mcp?code=private-query-value",
                headers={
                    "Accept": "application/json, text/event-stream",
                    "Cookie": "private-cookie-name=private-cookie-value",
                    "X-Remdo-Collaboration-Secret": "private-collaboration-secret",
                },
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "tools/call",
                    "params": {
                        "name": "create_document",
                        "arguments": {"title": "private-body-value"},
                    },
                },
            )
    return {
        "auth_status": auth_status,
        "tool_status": tool_response.status_code,
        "tool_error": tool_response.json()["result"]["content"][0]["text"],
    }


if __name__ == "__main__":
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "remdo.settings")
    django.setup()
    result = asyncio.run(
        {
            "exceptions": exceptions,
            "http-errors": http_errors,
            "disabled": disabled,
            "streaming-failure": streaming_failure,
            "mcp-failure": mcp_failure,
        }[sys.argv[1]]()
    )
    if settings.SENTRY_DSN:
        import sentry_sdk

        sentry_sdk.flush()
    print(json.dumps(result))
