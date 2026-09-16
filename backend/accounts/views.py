from allauth.account.views import LoginView as AllauthLoginView
from django.http import HttpResponseRedirect
from django.shortcuts import render
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache


@method_decorator(never_cache, name="dispatch")
class LoginView(AllauthLoginView):
    template_name = "accounts/login.html"

    def dispatch(self, request, *args, **kwargs):
        response = super().dispatch(request, *args, **kwargs)
        if request.user.is_authenticated and isinstance(response, HttpResponseRedirect):
            return render(request, "accounts/login_complete.html", {"next_url": response.url})
        return response
