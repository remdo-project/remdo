from pathlib import PurePosixPath
from urllib.parse import urlsplit, urlunsplit

from accounts.forms import ProductUpdateSubscriptionForm
from accounts.models import ProductUpdateSubscription
from allauth.core import ratelimit
from django.conf import settings
from django.contrib.auth.views import redirect_to_login
from django.shortcuts import redirect, render
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_http_methods, require_safe


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
    return public_home(request)


def public_home(request, *, subscription_form=None, subscription_saved=False):
    return render(
        request,
        "pages/home.html",
        {
            "canonical": f"{settings.APP_ORIGIN}/",
            "video": _home_video(settings.HOME_VIDEO_URL),
            "subscription_form": subscription_form or ProductUpdateSubscriptionForm(),
            "subscription_saved": subscription_saved,
        },
    )


@never_cache
@require_http_methods(["GET", "HEAD", "POST"])
def keep_me_posted(request):
    if request.method == "POST":
        limited = ratelimit.consume_or_429(request, action="product_update_subscription")
        if limited:
            return limited
    form = ProductUpdateSubscriptionForm(request.POST if request.method == "POST" else None)
    if request.method == "POST" and form.is_valid():
        ProductUpdateSubscription.objects.get_or_create(email=form.cleaned_data["email"])
        return redirect("/keep-me-posted/?saved=1#landing-signup")
    return public_home(
        request,
        subscription_form=form,
        subscription_saved=request.method != "POST" and request.GET.get("saved") == "1",
    )


def _home_video(url):
    if not url:
        return None
    parts = urlsplit(url)
    poster_path = str(PurePosixPath(parts.path).with_suffix(".jpg"))
    return {"url": url, "poster": urlunsplit(parts._replace(path=poster_path))}
