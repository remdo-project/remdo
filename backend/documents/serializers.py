from rest_framework import serializers

from .models import Document


class DocumentSerializer(serializers.ModelSerializer):
    shareable = serializers.BooleanField(read_only=True, default=False)

    class Meta:
        model = Document
        fields = ["id", "title", "shareable"]
        read_only_fields = ["id"]
        extra_kwargs = {"title": {"default": "", "trim_whitespace": False}}


class CurrentUserSerializer(serializers.ModelSerializer):
    userId = serializers.CharField(source="owner_id", read_only=True)
    homeDocumentId = serializers.CharField(source="id", read_only=True)
    publicServer = serializers.BooleanField(read_only=True, default=False)

    class Meta:
        model = Document
        fields = ["userId", "homeDocumentId", "publicServer"]


class ClientTokenSerializer(serializers.Serializer):
    docId = serializers.CharField()
    url = serializers.CharField()
    baseUrl = serializers.CharField()
    token = serializers.CharField(required=False)
    authorization = serializers.ChoiceField(choices=["full", "read-only"], required=False)


class ConfigSerializer(serializers.Serializer):
    publicServer = serializers.BooleanField()
    csrfCookieName = serializers.CharField()
    csrfToken = serializers.CharField()


class HealthSerializer(serializers.Serializer):
    ok = serializers.BooleanField()
