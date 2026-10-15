from http import HTTPMethod
from uuid import uuid4

import sentry_sdk

# Google's return to RemDo is the only place a failed sign-in reaches the server.
REPORTED_CLIENT_ERROR_ROUTES = {"accounts/google/login/callback/"}


def reports(status, route):
    return status >= 500 or (status >= 400 and route in REPORTED_CLIENT_ERROR_ROUTES)


class HttpErrorReportingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        captured = False
        status = None
        method = request.method if request.method in HTTPMethod else "OTHER"

        def matched_route():
            match = getattr(request, "resolver_match", None)
            return match.route if match else "<unmatched>"

        def prepare_event(event, hint):
            nonlocal captured
            record = hint.get("log_record")
            exceptions = event.get("exception", {}).get("values", [])
            automatic = any(
                item.get("mechanism", {}).get("type") == "django" for item in exceptions
            ) or (
                record is not None
                and record.name.startswith("django.")
                and 400 <= getattr(record, "status_code", 0) <= 599
            )
            captured = captured or automatic
            route = matched_route()
            event.setdefault("tags", {}).update({"http.method": method, "http.route": route})
            event["transaction"] = f"{method} {route}"
            # Unrelated diagnostics emitted by a view must neither invent a 500
            # nor suppress reporting the response that eventually leaves Django.
            if automatic or status is not None:
                event_status = status or getattr(record, "status_code", 500)
                if not reports(event_status, route):
                    return None
                details = getattr(request, "error_report_tags", {})
                event["tags"].update(details)
                event["tags"]["http.status_code"] = event_status
                event["fingerprint"] = [
                    "http-response",
                    method,
                    route,
                    str(event_status),
                ]
                if cause := details.get("auth.cause"):
                    event["fingerprint"].append(cause)
                event["level"] = "error" if event_status >= 500 else "warning"
            return event

        with sentry_sdk.new_scope() as scope:
            scope.set_tag("request_id", uuid4().hex)
            scope.add_event_processor(prepare_event)
            response = self.get_response(request)
            status = response.status_code
            if reports(status, matched_route()) and not captured:
                sentry_sdk.capture_message("HTTP error response")
            return response
