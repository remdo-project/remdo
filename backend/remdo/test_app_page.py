import json
import tempfile
from pathlib import Path

from accounts.models import User
from django.test import TestCase, override_settings


class AppPageTests(TestCase):
    def test_every_app_route_renders_the_app_page(self):
        for url in (
            "/",
            "/?next=%2Fn%2Fexample",
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
        self.assertEqual(self.client.post("/").status_code, 405)
        self.assertEqual(self.client.get("/sign-out/extra").status_code, 404)

    def test_page_is_identical_for_every_visitor(self):
        anonymous = self.client.get("/n/example")
        self.client.force_login(
            User.objects.create_superuser("staff@example.test", "staff-password-1234")
        )
        signed_in = self.client.get("/n/example")
        self.assertEqual(signed_in.content, anonymous.content)
        self.assertNotIn("Cookie", signed_in.headers.get("Vary", ""))
        self.assertContains(
            signed_in,
            '<a class="remdo-header-link" data-app-sign-out href="/sign-out/">Sign out…</a>',
            html=True,
        )
        self.assertNotContains(signed_in, "/admin/")

    @override_settings(FRONTEND_USE_SOURCE=True)
    def test_source_frontend_loads_the_development_entry(self):
        response = self.client.get("/")
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
                response = self.client.get("/")
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
