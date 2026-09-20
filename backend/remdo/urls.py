from accounts.views import LoginView
from allauth.account.views import AccountInactiveView
from django.contrib import admin
from django.urls import include, path, re_path
from documents import views
from drf_spectacular.views import SpectacularAPIView

from .public_pages import public_page

urlpatterns = [
    path("accounts/login/", LoginView.as_view(), name="account_login"),
    path("accounts/inactive/", AccountInactiveView.as_view(), name="account_inactive"),
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
