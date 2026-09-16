from django.contrib.auth import get_user_model
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .models import Document, DocumentGrant


class DocumentAccessSerializer(serializers.ModelSerializer):
    documentId = serializers.CharField(source="document_id", read_only=True)
    granteeUserId = serializers.CharField(source="user_id", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    name = serializers.CharField(source="user.get_full_name", read_only=True)

    class Meta:
        model = DocumentGrant
        fields = ["documentId", "granteeUserId", "email", "name"]


class ShareDocumentSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        try:
            user = get_user_model().objects.get(email=value.lower())
        except get_user_model().DoesNotExist:
            raise serializers.ValidationError("No account with this email exists on this server.")
        if user.pk == self.context["request"].user.pk:
            raise serializers.ValidationError("You already own this document.")
        return user


class DocumentSerializer(serializers.ModelSerializer):
    shareable = serializers.SerializerMethodField()
    access = serializers.SerializerMethodField()

    @extend_schema_field(DocumentAccessSerializer(many=True))
    def get_access(self, document):
        if document.owner_id != self.context["request"].user.pk:
            return []
        return DocumentAccessSerializer(document.grants.all(), many=True).data

    def get_shareable(self, document) -> bool:
        return document.kind == "document" and document.owner_id == self.context["request"].user.pk

    class Meta:
        model = Document
        fields = ["id", "title", "shareable", "access"]
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
