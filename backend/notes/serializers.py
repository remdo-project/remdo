from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .core import OPERATIONS

KINDS = ["account", "workspace", "folder", "document", "file"]


def versions(**kwargs):
    return serializers.DictField(child=serializers.CharField(allow_null=True), **kwargs)


@extend_schema_field({"type": "array", "items": {"$ref": "#/components/schemas/Note"}})
class NoteChildrenField(serializers.ListField):
    pass


class NoteSerializer(serializers.Serializer):
    ref = serializers.CharField()
    kind = serializers.ChoiceField(KINDS)
    text = serializers.CharField(allow_blank=True)
    operations = serializers.ListField(child=serializers.CharField())
    version = serializers.CharField(allow_null=True, required=False)
    hasChildren = serializers.BooleanField(required=False)
    children = NoteChildrenField(required=False)
    content = serializers.CharField(allow_blank=True, required=False)
    contentEncoding = serializers.ChoiceField(["utf8", "base64"], required=False)


class ReadQuerySerializer(serializers.Serializer):
    depth = serializers.IntegerField(min_value=0, max_value=100, default=1)
    content = serializers.BooleanField(default=False)


class ReplacementSerializer(serializers.Serializer):
    old = serializers.CharField(allow_blank=True, trim_whitespace=False)
    new = serializers.CharField(allow_blank=True, trim_whitespace=False)


class OperationSerializer(serializers.Serializer):
    op = serializers.ChoiceField(list(OPERATIONS))
    target = serializers.CharField(required=False)
    parent = serializers.CharField(required=False)
    kind = serializers.CharField(required=False)
    text = serializers.CharField(required=False, allow_blank=True, trim_whitespace=False)
    content = serializers.CharField(required=False, allow_blank=True, trim_whitespace=False)
    contentEncoding = serializers.ChoiceField(["utf8", "base64"], required=False)
    replacements = ReplacementSerializer(many=True, required=False)
    withChildren = serializers.BooleanField(required=False)


class CallSerializer(serializers.Serializer):
    operations = OperationSerializer(many=True, allow_empty=False)
    expected = versions(required=False, default=dict)
    dryRun = serializers.BooleanField(default=False)


class CallResultSerializer(serializers.Serializer):
    results = serializers.ListField(child=serializers.DictField())
    changes = serializers.ListField(child=serializers.DictField())
    revision = serializers.IntegerField(allow_null=True)
    dryRun = serializers.BooleanField()


class RefusalSerializer(serializers.Serializer):
    code = serializers.CharField()
    message = serializers.CharField()
    index = serializers.IntegerField(allow_null=True)
    versions = versions()
