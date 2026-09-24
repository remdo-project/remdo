from functools import wraps

from allauth.account.views import LoginView as AllauthLoginView
from allauth.socialaccount.providers.google.views import oauth2_callback
from django.http import HttpResponseRedirect
from django.shortcuts import redirect, render
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_POST


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


google_callback = never_cache(completes_login(oauth2_callback))
