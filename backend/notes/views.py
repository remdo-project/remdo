from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from documents.errors import UNAVAILABLE
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from . import service
from .serializers import (
    CallResultSerializer,
    CallSerializer,
    NoteSerializer,
    ReadQuerySerializer,
    RefusalSerializer,
)

REFUSAL_STATUS = {
    "INVALID_ARGUMENT": status.HTTP_400_BAD_REQUEST,
    "NOT_FOUND": status.HTTP_404_NOT_FOUND,
    "FAILED_PRECONDITION": status.HTTP_409_CONFLICT,
}
REFUSALS = {code: RefusalSerializer for code in REFUSAL_STATUS.values()}


class CanUseWorkspaces(permissions.BasePermission):
    def has_permission(self, request, view):
        return service.can_use_workspaces(request.user)


def refusal(code, message, http_status, index=None, versions=None):
    return Response(
        {"code": code, "message": message, "index": index, "versions": versions or {}},
        status=http_status,
    )


def refused(error):
    return refusal(error.code, str(error), REFUSAL_STATUS[error.code], error.index, error.versions)


@method_decorator(never_cache, name="dispatch")
class NotesView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanUseWorkspaces]


class NoteView(NotesView):
    @extend_schema(parameters=[ReadQuerySerializer], responses={200: NoteSerializer, **REFUSALS})
    def get(self, request, ref):
        query = ReadQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        try:
            return Response(service.read(request.user, ref, **query.validated_data))
        except service.Refusal as error:
            return refused(error)


class CallView(NotesView):
    @extend_schema(
        request=CallSerializer,
        responses={200: CallResultSerializer, 503: RefusalSerializer, **REFUSALS},
    )
    def post(self, request):
        call = CallSerializer(data=request.data)
        call.is_valid(raise_exception=True)
        data = call.validated_data
        try:
            return Response(
                service.call(request.user, data["operations"], data["expected"], data["dryRun"])
            )
        except service.Refusal as error:
            return refused(error)
        except service.NothingWritten:
            return refusal("UNAVAILABLE", UNAVAILABLE, status.HTTP_503_SERVICE_UNAVAILABLE)
