from urllib.parse import urlsplit

from django import template

register = template.Library()


@register.filter
def client_label(client):
    """The metadata host, which the app cannot forge, before its self-declared name."""
    return f"{urlsplit(client.id).hostname} (“{client.name}”)"
