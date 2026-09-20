import json

from django import template
from django.conf import settings

register = template.Library()
SHARED_STYLES = "src/client/ui/styles/shared.css"


@register.simple_tag
def shared_styles_urls():
    if settings.FRONTEND_USE_SOURCE_STYLES:
        return [f"/{SHARED_STYLES}"]
    manifest = json.loads(settings.FRONTEND_MANIFEST.read_text())
    return [f"/{asset}" for asset in manifest[SHARED_STYLES]["css"]]
