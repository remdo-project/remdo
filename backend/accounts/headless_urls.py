from allauth.headless.account import views
from allauth.headless.constants import Client
from django.urls import include, path

app_name = "headless"

account_urls = [
    path("auth/login", views.LoginView.as_api_view(client=Client.BROWSER), name="login"),
    path(
        "auth/session", views.SessionView.as_api_view(client=Client.BROWSER), name="current_session"
    ),
]
browser_urls = [path("v1/", include((account_urls, "account")))]

# Preserve allauth's names so its schema describes only these supported routes.
urlpatterns = [
    path("browser/", include((browser_urls, "browser"))),
    path("", include("allauth.headless.spec.urls")),
]
