import sentry_sdk
from sentry_sdk.integrations.argv import ArgvIntegration

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
    return event


def start(dsn, release, environment):
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
