import tempfile
from pathlib import Path

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase, override_settings


class PublicPageTests(SimpleTestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.pages = Path(directory.name)
        self.enterContext(override_settings(PUBLIC_PAGES_DIR=self.pages))

    def write_page(self, name="privacy", title="Privacy & data"):
        (self.pages / f"{name}.md").write_text(
            f"---\ntitle: {title}\ndescription: 'Our \"data\" policy'\n---\n\n"
            "## Your data\n\nKeep **control**. [Home](/)\n",
            encoding="utf-8",
        )

    def test_file_alone_publishes_page_and_metadata_without_authentication(self):
        self.write_page()
        response = self.client.get("/privacy/?campaign=test")
        self.assertContains(response, "<title>Privacy &amp; data · RemDo</title>", html=True)
        self.assertContains(
            response, '<meta name="description" content="Our &quot;data&quot; policy">', html=True
        )
        self.assertContains(
            response, f'<link rel="canonical" href="{settings.APP_ORIGIN}/privacy/">', html=True
        )
        self.assertContains(response, "<h1>Privacy &amp; data</h1>", html=True)
        self.assertContains(response, "<h2>Your data</h2>", html=True)
        self.assertContains(response, "<strong>control</strong>", html=True)
        self.assertIn("no-store", response.headers["Cache-Control"])
        self.assertEqual(self.client.head("/privacy/").content, b"")
        self.assertEqual(self.client.post("/privacy/").status_code, 405)
        self.assertRedirects(self.client.get("/privacy"), "/privacy/", status_code=301)
        self.write_page(title="Updated privacy")
        self.assertContains(self.client.get("/privacy/"), "Updated privacy")

    @override_settings(DEBUG=False, BUILD_REVISION="0123456789abcdef0123456789abcdef01234567")
    def test_shared_footer_shows_server_revision_without_authentication(self):
        self.write_page()
        response = self.client.get("/privacy/")
        self.assertContains(response, "#01234567")
        self.assertContains(
            response,
            'href="https://github.com/remdo-project/remdo/commit/0123456789abcdef0123456789abcdef01234567"',
        )
        self.assertContains(self.client.get("/accounts/login/"), "#01234567")

    def test_shared_footer_keeps_build_status_visible_without_revision(self):
        self.write_page()
        for debug, label in (
            (True, "Local development"),
            (False, "Build unknown"),
        ):
            with self.subTest(debug=debug), override_settings(DEBUG=debug, BUILD_REVISION=""):
                response = self.client.get("/privacy/")
                self.assertContains(response, label)
                self.assertNotContains(response, "github.com/remdo-project/remdo/commit/")

    def test_missing_and_non_page_paths_are_not_rendered(self):
        self.write_page()
        for url in (
            "/missing/",
            "/nested/privacy/",
            "/privacy.md",
            "/..%2Fprivacy/",
            f"/{'a' * 256}/",
        ):
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 404)

    def test_invalid_metadata_is_an_authoring_error(self):
        for source in (
            "No metadata",
            "---\ntitle: Missing description\n---\n",
            "---\n[invalid\n---\n",
        ):
            (self.pages / "invalid.md").write_text(source)
            with (
                self.subTest(source=source),
                self.assertRaisesMessage(ImproperlyConfigured, "invalid.md"),
            ):
                self.client.get("/invalid/")
