from allauth.account.views import LoginView as AllauthLoginView
from django.http import HttpResponseRedirect
from django.shortcuts import redirect, render
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_POST


def complete_login(request, response):
    if request.user.is_authenticated and isinstance(response, HttpResponseRedirect):
        return render(request, "accounts/login_complete.html", {"next_url": response.url})
    return response


@never_cache
@require_POST
def admin_logout(request):
    # Browser cleanup and unsynced-edit confirmation must precede revocation.
    return redirect("/sign-out/")


@method_decorator(never_cache, name="dispatch")
class LoginView(AllauthLoginView):
    template_name = "accounts/login.html"

    def dispatch(self, request, *args, **kwargs):
        return complete_login(request, super().dispatch(request, *args, **kwargs))
