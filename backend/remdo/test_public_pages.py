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
        self.assertContains(
            response, '<a href="/privacy/" aria-current="page">Privacy</a>', html=True
        )
        self.assertIn("no-store", response.headers["Cache-Control"])
        self.assertEqual(self.client.head("/privacy/").content, b"")
        self.assertEqual(self.client.post("/privacy/").status_code, 405)
        self.assertRedirects(self.client.get("/privacy"), "/privacy/", status_code=301)
        self.write_page(title="Updated privacy")
        self.assertContains(self.client.get("/privacy/"), "Updated privacy")

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
