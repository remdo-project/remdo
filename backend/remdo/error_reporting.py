import sentry_sdk
from django.core.exceptions import ImproperlyConfigured
from sentry_sdk.integrations.argv import ArgvIntegration
from sentry_sdk.utils import BadDsn, Dsn

KEPT_REQUEST_HEADERS = {"user-agent"}


def scrub_event(event, hint):
    request = event.get("request")
    if request:
        # Internal collaboration calls carry the service credential in a header,
        # and OAuth callbacks carry authorization codes in the query string.
        request["headers"] = {
            name: value
            for name, value in request.get("headers", {}).items()
            if name.lower() in KEPT_REQUEST_HEADERS
        }
        for field in ("cookies", "query_string", "data", "env"):
            request.pop(field, None)
    # Logging records from Django's request handling carry the request, whose
    # text form includes the query string.
    event.get("extra", {}).pop("request", None)
    for breadcrumb in event.get("breadcrumbs", {}).get("values", []):
        breadcrumb.get("data", {}).pop("request", None)
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
        send_default_pii=False,
        include_local_variables=False,
        max_request_body_size="never",
        auto_session_tracking=False,
        before_send=scrub_event,
        # Command lines can carry credentials.
        disabled_integrations=[ArgvIntegration()],
    )
