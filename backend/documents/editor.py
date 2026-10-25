"""Private editor calls. User authorization is repeated by the collaboration hub."""

import json

import httpx2
from django.conf import settings

from .errors import UNAVAILABLE, OperationError

UNCONFIRMED = (
    "Document changes are unconfirmed and may still be saved. Check the document before retrying "
    "to avoid duplicate changes. The editor did not confirm the request."
)


async def call_editor(operation, document_id, authorization, **arguments):
    # Acquisition allows 30 seconds; synchronization and the persistence barrier
    # may each need another 15. A timeout does not cancel an already dispatched write.
    write = operation != "read"
    try:
        body = json.dumps(
            {"operation": operation, "documentId": document_id, **arguments},
            ensure_ascii=False,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8", errors="backslashreplace")
    except (ValueError, TypeError) as error:
        raise OperationError("INVALID_ARGUMENT", "The editor request is not valid JSON.") from error
    try:
        async with httpx2.AsyncClient(
            timeout=65, trust_env=False, follow_redirects=False
        ) as client:
            response = await client.post(
                f"{settings.COLLAB_SERVER_ORIGIN}/internal/editor",
                headers={
                    "Authorization": authorization,
                    "X-Remdo-Collaboration-Secret": settings.COLLAB_INTERNAL_SECRET,
                    "Content-Type": "application/json",
                },
                content=body,
            )
        # These statuses are emitted by our private handler before dispatch.
        # Other failures may have interrupted an operation after it started.
        if response.status_code in {403, 413, 503}:
            raise OperationError("UNAVAILABLE", UNAVAILABLE)
        response.raise_for_status()
        payload = response.json()
        if "error" in payload:
            error = payload["error"]
            if (
                error["code"]
                not in {
                    "INVALID_ARGUMENT",
                    "NOT_FOUND",
                    "UNAUTHENTICATED",
                    "PERMISSION_DENIED",
                    "UNAVAILABLE",
                    "OUTCOME_UNCONFIRMED",
                    "INTERNAL",
                }
                or not isinstance(error["message"], str)
                or not isinstance(error["reconnect"], bool)
            ):
                raise ValueError("Invalid editor error")
            raise OperationError(error["code"], error["message"], reconnect=error["reconnect"])
        value = payload["result"]
        valid = (
            isinstance(value, str)
            if operation == "read"
            else isinstance(value, list) and all(isinstance(item, str) for item in value)
            if operation == "append"
            else value is None
        )
        if not valid:
            raise ValueError("Invalid editor result")
        return value
    except (httpx2.ConnectError, httpx2.ConnectTimeout) as error:
        raise OperationError("UNAVAILABLE", UNAVAILABLE) from error
    except (httpx2.HTTPError, ValueError, KeyError, TypeError) as error:
        raise OperationError(
            "OUTCOME_UNCONFIRMED" if write else "UNAVAILABLE",
            UNCONFIRMED if write else UNAVAILABLE,
        ) from error
