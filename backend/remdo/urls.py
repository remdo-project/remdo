from accounts.views import LoginView
from django.contrib import admin
from django.urls import include, path
from documents import views
from drf_spectacular.views import SpectacularAPIView

urlpatterns = [
    path("accounts/login/", LoginView.as_view(), name="account_login"),
    path("admin/", admin.site.urls),
    path("api/auth/", include("allauth.headless.urls")),
    path("api/health", views.HealthView.as_view()),
    path("api/config", views.ConfigView.as_view()),
    path("api/current-user", views.CurrentUserView.as_view()),
    path("api/documents", views.DocumentListCreateView.as_view()),
    path("api/documents/<str:document_id>/sync-tokens", views.SyncTokenView.as_view()),
    path("api/schema", SpectacularAPIView.as_view()),
]
