import json
import tempfile
from pathlib import Path
from urllib.parse import quote

from accounts.models import User
from accounts.views import LoginView
from django.conf import settings
from django.test import TestCase, override_settings
from django.urls import path

from .app_page import home_page


class NoGoogleLoginUrls:
    urlpatterns = [
        path("", home_page),
        path("accounts/login/", LoginView.as_view(), name="account_login"),
    ]


class AppPageTests(TestCase):
    def test_every_app_route_renders_the_app_page(self):
        for url in (
            "/app-shell/",
            "/n/example",
            "/n/example?note=1",
            "/n/",
            "/n/a/b",
            "/sign-out",
            "/sign-out/?probe=1",
        ):
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertContains(response, '<div class="remdo-slot" id="root"></div>', html=True)
                self.assertIn("no-store", response.headers["Cache-Control"])
        self.assertEqual(self.client.post("/app-shell/").status_code, 405)
        self.assertEqual(self.client.get("/sign-out/extra").status_code, 404)

    def test_page_is_identical_for_every_visitor(self):
        anonymous = self.client.get("/n/example")
        self.client.force_login(
            User.objects.create_superuser("staff@example.test", "staff-password-1234")
        )
        signed_in = self.client.get("/n/example")
        self.assertEqual(signed_in.content, anonymous.content)
        self.assertNotIn("Cookie", signed_in.headers.get("Vary", ""))
        self.assertNotContains(signed_in, "/sign-out/")
        self.assertNotContains(signed_in, "/admin/")

    @override_settings(FRONTEND_USE_SOURCE=True)
    def test_source_frontend_loads_the_development_entry(self):
        response = self.client.get("/app-shell/")
        self.assertContains(
            response, '<script type="module" src="/@vite/client"></script>', html=True
        )
        self.assertContains(
            response,
            '<script type="module" src="/src/client/app/shell/main.tsx"></script>',
            html=True,
        )
        self.assertNotContains(response, 'rel="manifest"')

    def test_built_frontend_loads_manifest_assets(self):
        with tempfile.TemporaryDirectory() as directory:
            manifest = Path(directory) / "manifest.json"
            manifest.write_text(
                json.dumps(
                    {
                        "src/client/app/shell/main.tsx": {
                            "file": "app-assets/main-test.js",
                            "css": ["app-assets/main-test.css"],
                            "imports": ["_chunk.js"],
                        },
                        "_chunk.js": {
                            "file": "app-assets/chunk.js",
                            "css": ["app-assets/chunk.css"],
                        },
                        "src/client/ui/styles/shared.css": {
                            "file": "app-assets/shared-test.js",
                            "css": ["app-assets/shared-test.css"],
                        },
                    }
                )
            )
            with override_settings(FRONTEND_USE_SOURCE=False, FRONTEND_MANIFEST=manifest):
                response = self.client.get("/app-shell/")
        content = response.content.decode()
        self.assertContains(
            response, '<script type="module" src="/app-assets/main-test.js"></script>', html=True
        )
        self.assertContains(
            response, '<link rel="manifest" href="/manifest.webmanifest">', html=True
        )
        self.assertLess(
            content.index("/app-assets/chunk.css"), content.index("/app-assets/main-test.css")
        )
        self.assertNotIn("/@vite/client", content)
        self.assertNotIn("/app-assets/shared-test.css", content)


class HomePageTests(TestCase):
    def test_signed_out_visitors_get_the_public_home(self):
        response = self.client.get("/?utm_source=test")
        self.assertContains(
            response,
            '<h1 id="landing-title" class="landing-title">Keyboard-first collaborative outliner</h1>',
            html=True,
        )
        self.assertContains(
            response, f'<link rel="canonical" href="{settings.APP_ORIGIN}/">', html=True
        )
        self.assertContains(response, 'name="description"')
        self.assertContains(response, 'href="/accounts/login/"')
        self.assertNotContains(response, 'id="root"')
        self.assertNotContains(response, 'type="module"')
        self.assertIn("no-store", response.headers["Cache-Control"])
        self.assertEqual(self.client.post("/").status_code, 405)

    def test_public_home_omits_the_video_frame_when_none_is_configured(self):
        response = self.client.get("/")
        self.assertNotContains(response, "<video")
        self.assertNotContains(response, "landing-video-background")

    @override_settings(ROOT_URLCONF=NoGoogleLoginUrls)
    def test_public_home_offers_plain_sign_in_when_google_is_unconfigured(self):
        response = self.client.get("/")
        self.assertRegex(
            response.content.decode(),
            r'(?s)<a\b[^>]*class="landing-button"[^>]*href="/accounts/login/"[^>]*>\s*Sign in\s*</a>',
        )
        self.assertNotContains(response, "Sign in with Google")
        self.assertNotContains(response, "/accounts/google/login/")

    @override_settings(HOME_VIDEO_URL="https://share.example.test/media/demo.mp4?v=2")
    def test_public_home_offers_the_configured_video_with_its_poster(self):
        response = self.client.get("/")
        self.assertContains(
            response,
            '<source src="https://share.example.test/media/demo.mp4?v=2" type="video/mp4">',
            html=True,
        )
        self.assertContains(response, 'poster="https://share.example.test/media/demo.jpg?v=2"')
        self.assertContains(response, 'preload="none"')
        self.assertNotContains(response, "autoplay")

    def test_signed_out_entry_targets_go_to_sign_in(self):
        for url in ("/?next=%2Fn%2Fexample", "/?doc=example"):
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertRedirects(
                    response,
                    f"/accounts/login/?next={quote(url, safe='')}",
                    fetch_redirect_response=False,
                )

    def test_signed_in_visitors_get_the_app_page(self):
        self.client.force_login(User.objects.create_user("user@example.test", "user-password-1234"))
        response = self.client.get("/?next=%2Fn%2Fexample")
        self.assertContains(response, '<div class="remdo-slot" id="root"></div>', html=True)
