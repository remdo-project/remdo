from urllib.parse import urlsplit, urlunsplit

import httpx
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured


# TODO: Replace this bounded control adapter when the released Y-Sweet Python SDK
# supports Python 3.14 and configurable request timeouts. SDK 0.9.1 requires an
# incompatible pycrdt/PyO3 and exposes neither a timeout nor an injectable transport.
def issue_token(document_id):
    connection = urlsplit(settings.YSWEET_CONNECTION_STRING)
    if connection.scheme not in ("ys", "yss", "http", "https") or not connection.hostname:
        raise ImproperlyConfigured("YSWEET_CONNECTION_STRING is required.")
    token = connection.username or settings.YSWEET_SERVER_TOKEN
    if not token:
        raise ImproperlyConfigured("YSWEET_SERVER_TOKEN is required.")
    scheme = "https" if connection.scheme in ("yss", "https") else "http"
    authority = connection.netloc.rsplit("@", 1)[-1]
    base_url = urlunsplit((scheme, authority, connection.path.rstrip("/") + "/", "", ""))
    # Y-Sweet's public control API; document creation is idempotent by document ID.
    with httpx.Client(
        base_url=base_url, headers={"Authorization": f"Bearer {token}"}, timeout=10
    ) as client:
        created = client.post("doc/new", json={"docId": document_id})
        created.raise_for_status()
        response = client.post(f"doc/{document_id}/auth", json={"authorization": "full"})
        response.raise_for_status()
    result = response.json()
    origin = urlsplit(settings.APP_ORIGIN)
    for field, protocol in (
        ("url", "wss" if origin.scheme == "https" else "ws"),
        ("baseUrl", origin.scheme),
    ):
        raw = urlsplit(result[field])
        result[field] = urlunsplit((protocol, origin.netloc, raw.path, raw.query, raw.fragment))
    return result
