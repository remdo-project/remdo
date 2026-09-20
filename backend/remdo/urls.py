from accounts.views import LoginView, admin_logout
from allauth.account.decorators import secure_admin_login
from allauth.account.views import AccountInactiveView
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.decorators.http import require_safe
from documents import views
from drf_spectacular.views import SpectacularAPIView

from .public_pages import public_page

admin.site.login = secure_admin_login(require_safe(admin.site.login))

urlpatterns = [
    path("accounts/login/", LoginView.as_view(), name="account_login"),
    path("accounts/inactive/", AccountInactiveView.as_view(), name="account_inactive"),
    path("admin/logout/", admin_logout),
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.headless_urls")),
    path("api/health", views.HealthView.as_view()),
    path("api/config", views.ConfigView.as_view()),
    path("api/current-user", views.CurrentUserView.as_view()),
    path("api/documents", views.DocumentListCreateView.as_view()),
    path("api/documents/<str:document_id>/access", views.DocumentShareView.as_view()),
    path("api/documents/<str:document_id>/sync-tokens", views.SyncTokenView.as_view()),
    path("api/schema", SpectacularAPIView.as_view()),
    re_path(r"^(?P<slug>[a-z0-9]+(?:-[a-z0-9]+)*)/$", public_page, name="public_page"),
]
