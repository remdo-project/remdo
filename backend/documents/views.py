from django.conf import settings
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from drf_spectacular.utils import extend_schema
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Document, DocumentGrant
from .serializers import (
    ConfigSerializer,
    CurrentUserSerializer,
    DocumentAccessSerializer,
    DocumentSerializer,
    HealthSerializer,
    ShareDocumentSerializer,
)


class IsDocumentOwner(permissions.BasePermission):
    message = "Document access denied."

    def has_object_permission(self, request, view, document):
        return document.owner_id == request.user.pk


@method_decorator(never_cache, name="dispatch")
class CurrentUserView(generics.RetrieveAPIView):
    serializer_class = CurrentUserSerializer

    def get_object(self):
        return self.request.user


@method_decorator(never_cache, name="dispatch")
class DocumentListCreateView(generics.ListCreateAPIView):
    serializer_class = DocumentSerializer

    def get_queryset(self):
        return Document.objects.accessible_to(self.request.user).prefetch_related("grants__user")

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


@method_decorator(never_cache, name="dispatch")
class DocumentShareView(generics.GenericAPIView):
    queryset = Document.objects.all()
    lookup_url_kwarg = "document_id"
    permission_classes = [permissions.IsAuthenticated, IsDocumentOwner]
    serializer_class = ShareDocumentSerializer

    @extend_schema(responses=DocumentAccessSerializer)
    def post(self, request, *args, **kwargs):
        document = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        grant, _ = DocumentGrant.objects.get_or_create(
            document=document, user=serializer.validated_data["email"]
        )
        return Response(DocumentAccessSerializer(grant).data)


class HealthView(APIView):
    permission_classes = [permissions.AllowAny]

    @extend_schema(responses=HealthSerializer)
    def get(self, request):
        # Readiness includes a migrated database.
        Document.objects.exists()
        return Response({"ok": True})


@method_decorator(never_cache, name="dispatch")
class ConfigView(APIView):
    permission_classes = [permissions.AllowAny]

    @extend_schema(responses=ConfigSerializer)
    def get(self, request):
        return Response(
            {
                "csrfCookieName": settings.CSRF_COOKIE_NAME,
                "buildRevision": settings.BUILD_REVISION,
                "csrfToken": get_token(request),
            }
        )
