from functools import wraps
from urllib.parse import urlencode

from allauth.account import views as allauth_views
from allauth.account.utils import filter_users_by_email
from allauth.account.views import LoginView as AllauthLoginView
from allauth.socialaccount.providers.google.views import oauth2_callback
from django.conf import settings
from django.http import Http404, HttpResponseRedirect
from django.shortcuts import redirect, render
from django.urls import reverse
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_POST

from .forms import EmailEntryForm


def email_signup_only(view):
    @wraps(view)
    def wrapper(request, *args, **kwargs):
        if not settings.EMAIL_SIGNUP_ENABLED:
            raise Http404
        return view(request, *args, **kwargs)

    return wrapper


def completes_login(view):
    @wraps(view)
    def wrapper(request, *args, **kwargs):
        # The handoff clears the pending-sign-out marker, so only an actual
        # authentication may render it. allauth redirects a visitor who already has a
        # session without asking for credentials, which must not supersede a pending
        # logout on this device.
        authenticated_before = request.user.is_authenticated
        response = view(request, *args, **kwargs)
        if (
            request.user.is_authenticated
            and not authenticated_before
            and isinstance(response, HttpResponseRedirect)
        ):
            return render(request, "accounts/login_complete.html", {"next_url": response.url})
        return response

    return wrapper


@never_cache
@require_POST
def admin_logout(request):
    # Browser cleanup and unsynced-edit confirmation must precede revocation.
    return redirect("/sign-out/")


@method_decorator(never_cache, name="dispatch")
@method_decorator(completes_login, name="dispatch")
class LoginView(AllauthLoginView):
    template_name = "accounts/login.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        next_url = context["redirect_field_value"]

        def login_url(**query):
            query = {**({"next": next_url} if next_url else {}), **query}
            return (
                f"{reverse('account_login')}?{urlencode(query)}"
                if query
                else reverse("account_login")
            )

        context.update(
            email_signup_enabled=settings.EMAIL_SIGNUP_ENABLED,
            password_mode=not settings.EMAIL_SIGNUP_ENABLED
            or self.request.GET.get("method") == "password",
            email_form=EmailEntryForm(),
            password_url=login_url(method="password"),
            email_url=login_url(),
        )
        return context


google_callback = never_cache(completes_login(oauth2_callback))


@never_cache
@email_signup_only
@require_POST
def continue_with_email(request):
    email = request.POST.get("email", "").strip()
    known = filter_users_by_email(email, is_active=True, prefer_verified=True)
    return (allauth_views.request_login_code if known else allauth_views.signup)(request)


signup = never_cache(email_signup_only(allauth_views.signup))
request_login_code = never_cache(email_signup_only(allauth_views.request_login_code))
confirm_login_code = never_cache(
    email_signup_only(completes_login(allauth_views.confirm_login_code))
)
confirm_email_code = never_cache(
    email_signup_only(completes_login(allauth_views.email_verification_sent))
)


@never_cache
@email_signup_only
@require_POST
def cancel_confirmation(request):
    # The code pages post their cancel button to the logout route. A signed-in
    # user leaves through the app's own sign-out flow instead.
    if request.user.is_authenticated:
        return redirect("/sign-out/")
    request.session.flush()
    return redirect("account_login")
