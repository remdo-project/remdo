from django.conf import settings
from django.contrib.auth.views import redirect_to_login
from django.shortcuts import render
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_safe


@never_cache
@require_safe
def app_page(request):
    return render(request, "app.html")


@never_cache
@require_safe
def home_page(request):
    if request.user.is_authenticated:
        return app_page(request)
    if "next" in request.GET or "doc" in request.GET:
        return redirect_to_login(request.get_full_path())
    return render(request, "pages/home.html", {"canonical": f"{settings.APP_ORIGIN}/"})
