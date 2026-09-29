"""Document-list change notices relayed to connected sessions by the collaboration hub."""

import json
import logging
from urllib.request import Request, urlopen

from django.conf import settings
from django.db import transaction

logger = logging.getLogger(__name__)


def document_audience(document):
    return {document.owner_id, *document.grants.values_list("user_id", flat=True)}


def notify_document_list_changed(user_ids):
    body = json.dumps({"userIds": [str(user_id) for user_id in user_ids]}).encode()

    def send():
        request = Request(
            f"{settings.COLLAB_SERVER_ORIGIN}/internal/document-list-changed",
            data=body,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "X-Remdo-Collaboration-Secret": settings.COLLAB_INTERNAL_SECRET,
            },
        )
        try:
            with urlopen(request, timeout=1):
                pass
        # Connected sessions reread their list when their stream reconnects, so a
        # lost notice delays an update without failing the committed change.
        except OSError:
            logger.warning("document-list notice failed")

    transaction.on_commit(send)
