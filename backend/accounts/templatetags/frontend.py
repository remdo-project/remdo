import json

from django import template
from django.conf import settings

register = template.Library()
SHARED_STYLES = "src/client/ui/styles/shared.css"
APP_ENTRY = "src/client/app/shell/main.tsx"


def load_manifest():
    return json.loads(settings.FRONTEND_MANIFEST.read_text())


@register.simple_tag
def shared_styles_urls():
    if settings.FRONTEND_USE_SOURCE:
        return [f"/{SHARED_STYLES}"]
    return [f"/{asset}" for asset in load_manifest()[SHARED_STYLES]["css"]]


@register.simple_tag
def app_assets():
    if settings.FRONTEND_USE_SOURCE:
        return {
            "scripts": ["/@vite/client", f"/{APP_ENTRY}"],
            "stylesheets": shared_styles_urls(),
            "manifest": None,
        }
    manifest = load_manifest()
    stylesheets = []
    visited = set()

    def collect(chunk):
        if chunk in visited:
            return
        visited.add(chunk)
        for imported in manifest[chunk].get("imports", []):
            collect(imported)
        stylesheets.extend(f"/{asset}" for asset in manifest[chunk].get("css", []))

    collect(APP_ENTRY)
    return {
        "scripts": [f"/{manifest[APP_ENTRY]['file']}"],
        "stylesheets": list(dict.fromkeys(stylesheets)),
        "manifest": "/manifest.webmanifest",
    }
