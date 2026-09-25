from urllib.parse import urlsplit

from django import template

register = template.Library()


@register.filter
def client_label(client):
    """The self-declared name alongside the metadata host, which the app cannot forge."""
    return f"{client.name} ({urlsplit(client.id).hostname})"
