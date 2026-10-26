"""Metadata mutations shared by HTTP and MCP consumers."""

from .notices import document_audience, notify_document_list_changed


def create_document(serializer, user):
    document = serializer.save(owner=user)
    notify_document_list_changed({user.pk})
    return document


def rename_document(serializer):
    document = serializer.save()
    notify_document_list_changed(document_audience(document))
    return document
