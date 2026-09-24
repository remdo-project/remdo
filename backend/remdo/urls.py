from accounts.views import LoginView, admin_logout
from allauth.account.decorators import secure_admin_login
from allauth.account.views import AccountInactiveView
from django.conf import settings
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.decorators.http import require_safe
from documents import internal, views
from drf_spectacular.views import SpectacularAPIView

from .app_page import app_page, home_page
from .public_pages import public_page

admin.site.login = secure_admin_login(require_safe(admin.site.login))

urlpatterns = [
    path("", home_page),
    path("app-shell/", app_page),
    re_path(r"^n/", app_page),
    re_path(r"^sign-out/?$", app_page),
    path("accounts/login/", LoginView.as_view(), name="account_login"),
    path("accounts/inactive/", AccountInactiveView.as_view(), name="account_inactive"),
    path("admin/logout/", admin_logout),
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.headless_urls")),
    path("api/health", views.HealthView.as_view()),
    path("api/config", views.ConfigView.as_view()),
    path("api/current-user", views.CurrentUserView.as_view()),
    path("api/documents", views.DocumentListCreateView.as_view()),
    path("api/documents/<str:document_id>", views.DocumentView.as_view()),
    path("api/documents/<str:document_id>/access", views.DocumentShareView.as_view()),
    path("internal/collaboration/documents/<str:document_id>/authorize", internal.authorize),
    path("internal/collaboration/documents/<str:document_id>/content", internal.content),
    path("api/schema", SpectacularAPIView.as_view()),
    re_path(r"^(?P<slug>[a-z0-9]+(?:-[a-z0-9]+)*)/$", public_page, name="public_page"),
]
if settings.DEBUG:
    urlpatterns.append(path("dev/lexical-demo", app_page))
