import logging
from urllib.parse import quote

import sentry_sdk
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from sentry_sdk.integrations.argv import ArgvIntegration
from sentry_sdk.integrations.logging import LoggingIntegration
from sentry_sdk.utils import BadDsn, Dsn

KEPT_REQUEST_HEADERS = {"user-agent"}


def scrub_event(event, hint):
    request = event.get("request")
    if request:
        # Streaming failures can be captured after the HTTP reporter's scope
        # ends. Keep only a route-pattern URL supplied by that reporter.
        request.pop("url", None)
        # The home route is empty, and an unescaped `?` in a regex route would
        # cut the URL where a query string begins.
        if (route := event.get("tags", {}).get("http.route")) is not None:
            request["url"] = settings.APP_ORIGIN + "/" + quote(route, safe="/<>:")
        # Internal collaboration calls carry the service credential in a header.
        request["headers"] = {
            name: value
            for name, value in request.get("headers", {}).items()
            if name.lower() in KEPT_REQUEST_HEADERS
        }
    # Logging records from Django's request handling carry the request, whose
    # text form includes the query string.
    event.get("extra", {}).pop("request", None)
    if breadcrumbs := event.get("breadcrumbs"):
        # Django's request-log messages also contain the concrete path. Dropping
        # their request field alone leaves that path in this and later reports.
        breadcrumbs["values"] = [
            breadcrumb
            for breadcrumb in breadcrumbs.get("values", [])
            if "request" not in breadcrumb.get("data", {})
        ]
    return event


def start(dsn, release, environment):
    try:
        # The gateway and Node servers read the variable verbatim.
        if dsn != dsn.strip():
            raise BadDsn("surrounding whitespace")
        parsed = Dsn(dsn)
    except BadDsn as error:
        raise ImproperlyConfigured("SENTRY_DSN must be a Sentry DSN.") from error
    # Startup configuration hands the DSN to browsers.
    if parsed.secret_key:
        raise ImproperlyConfigured("SENTRY_DSN must not include a secret key.")
    sentry_sdk.init(
        dsn=dsn,
        release=release or None,
        environment=environment,
        data_collection={
            "user_info": False,
            "cookies": {"mode": "off"},
            "http_bodies": [],
            "url_query_params": {"mode": "off"},
            "database_query_data": False,
            "stack_frame_variables": False,
        },
        attach_stacktrace=False,
        auto_session_tracking=False,
        before_send=scrub_event,
        # sentry-sdk 3 no longer turns logged errors into events by default, and
        # its log stream would bypass before_send.
        integrations=[LoggingIntegration(level=None, event_level=logging.ERROR)],
        # Command lines can carry credentials.
        disabled_integrations=[ArgvIntegration()],
    )
