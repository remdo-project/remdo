from django.conf import settings
from django.http import Http404, HttpResponse
from django.views.decorators.http import require_GET


@require_GET
def openai_apps_challenge(request):
    if not settings.OPENAI_APPS_CHALLENGE:
        raise Http404
    return HttpResponse(settings.OPENAI_APPS_CHALLENGE, content_type="text/plain")
