import tempfile
from pathlib import Path
from unittest import skip

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase, override_settings


class BlogTests(SimpleTestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.posts = Path(directory.name) / "blog"
        self.pages = Path(directory.name) / "pages"
        self.posts.mkdir()
        self.pages.mkdir()
        self.enterContext(override_settings(BLOG_DIR=self.posts, PUBLIC_PAGES_DIR=self.pages))

    def write_post(self, slug, date="2026-10-07", body="Lede.\n\n## Section\n\nText.", **fields):
        front_matter = {
            "title": f"Title of {slug}",
            "description": f"Excerpt of {slug}",
            "date": date,
            "topic": "Perspectives",
            "image": "/site-assets/blog/perspectives.webp",
            **fields,
        }
        lines = "\n".join(f"{key}: {value}" for key, value in front_matter.items())
        (self.posts / f"{slug}.md").write_text(f"---\n{lines}\n---\n\n{body}\n", encoding="utf-8")

    def test_index_lists_posts_newest_first_and_same_date_by_slug(self):
        self.write_post("older", date="2026-09-27")
        self.write_post("same-day-b")
        self.write_post("same-day-a")
        self.write_post("newest", date="2026-10-08")
        response = self.client.get("/blog/")
        self.assertEqual(
            [entry.slug for entry in response.context["posts"]],
            ["newest", "same-day-a", "same-day-b", "older"],
        )
        self.assertContains(response, "<title>Blog · RemDo</title>", html=True)
        self.assertContains(
            response, f'<link rel="canonical" href="{settings.APP_ORIGIN}/blog/">', html=True
        )
        self.assertContains(response, "<h1>Blog</h1>", html=True)

    def test_index_entry_shows_image_date_topic_title_description_and_link(self):
        self.write_post("small-things", topic="Case study")
        response = self.client.get("/blog/")
        self.assertContains(
            response,
            '<img class="landing-blog-image" src="/site-assets/blog/perspectives.webp"'
            ' alt="" width="224" height="224">',
            html=True,
        )
        self.assertContains(
            response, '<time datetime="2026-10-07">October 7, 2026</time>', html=True
        )
        self.assertContains(response, "<span>Case study</span>", html=True)
        self.assertContains(
            response, '<a href="/blog/small-things/">Title of small-things</a>', html=True
        )
        self.assertContains(response, "Excerpt of small-things")
        self.assertContains(response, 'href="/blog/small-things/" aria-label="Read post:')

    def test_empty_blog_shows_its_heading_without_entries(self):
        response = self.client.get("/blog/")
        self.assertContains(response, "<h1>Blog</h1>", html=True)
        self.assertNotContains(response, "landing-blog-entry")
        self.enterContext(override_settings(BLOG_DIR=self.posts / "missing"))
        self.assertContains(self.client.get("/blog/"), "<h1>Blog</h1>", html=True)

    def test_post_page_shows_heading_details_body_and_navigation(self):
        self.write_post("first", date="2026-10-07", author="Ada")
        self.write_post("second", date="2026-10-02")
        self.write_post("third", date="2026-09-27")
        response = self.client.get("/blog/first/?campaign=test")
        self.assertContains(response, "<title>Title of first · RemDo</title>", html=True)
        self.assertContains(
            response, '<meta name="description" content="Excerpt of first">', html=True
        )
        self.assertContains(
            response, f'<link rel="canonical" href="{settings.APP_ORIGIN}/blog/first/">', html=True
        )
        self.assertContains(response, "<h1>Title of first</h1>", html=True)
        self.assertContains(response, '<p class="landing-blog-author">Ada</p>', html=True)
        self.assertContains(response, "October 7, 2026</time> | 1 min read")
        self.assertContains(response, "<p>Lede.</p>", html=True)
        self.assertContains(response, "<h2>Section</h2>", html=True)
        self.assertContains(response, 'href="/blog/"', count=2)
        self.assertContains(
            response, '<a class="landing-blog-next-title" href="/blog/second/">Title of second</a>'
        )
        self.assertContains(response, 'aria-label="Read post: Title of second"')
        self.assertNotContains(response, "Title of third")
        self.assertIn("no-store", response.headers["Cache-Control"])

    def test_author_defaults_and_last_post_has_no_next_post(self):
        self.write_post("only")
        response = self.client.get("/blog/only/")
        self.assertContains(response, '<p class="landing-blog-author">RemDo team</p>', html=True)
        self.assertNotContains(response, "Next post")

    def test_reading_time_is_word_count_over_200_rounded_up(self):
        for slug, words in (("short", 1), ("exact", 200), ("over", 201)):
            self.write_post(slug, body=" ".join(["word"] * words))
        self.assertContains(self.client.get("/blog/short/"), "| 1 min read")
        self.assertContains(self.client.get("/blog/exact/"), "| 1 min read")
        self.assertContains(self.client.get("/blog/over/"), "| 2 min read")

    def test_missing_posts_and_non_slug_paths_are_not_found(self):
        self.write_post("real")
        for url in (
            "/blog/missing/",
            "/blog/Real/",
            "/blog/real.md/",
            "/blog/a/b/",
            f"/blog/{'a' * 256}/",
        ):
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 404)

    def test_blog_routes_take_precedence_over_a_public_page_named_blog(self):
        (self.pages / "blog.md").write_text("---\ntitle: Page\ndescription: Page\n---\n\nPage\n")
        self.assertContains(self.client.get("/blog/"), "<h1>Blog</h1>", html=True)

    def test_urls_redirect_to_their_trailing_slash_and_accept_only_safe_methods(self):
        self.write_post("real")
        self.assertRedirects(
            self.client.get("/blog"), "/blog/", status_code=301, fetch_redirect_response=False
        )
        self.assertRedirects(
            self.client.get("/blog/real"),
            "/blog/real/",
            status_code=301,
            fetch_redirect_response=False,
        )
        self.assertEqual(self.client.head("/blog/real/").content, b"")
        self.assertEqual(self.client.post("/blog/").status_code, 405)
        self.assertEqual(self.client.post("/blog/real/").status_code, 405)

    @skip("The Blog header link is hidden; see site_header.html")
    def test_header_marks_blog_current_on_the_index_and_every_post_only(self):
        self.write_post("real")
        for url in ("/blog/", "/blog/real/"):
            with self.subTest(url=url):
                self.assertContains(
                    self.client.get(url), '<a href="/blog/" aria-current="page">Blog</a>', html=True
                )
        (self.pages / "privacy.md").write_text("---\ntitle: Privacy\ndescription: Privacy\n---\n")
        self.assertContains(self.client.get("/privacy/"), '<a href="/blog/">Blog</a>', html=True)

    def test_invalid_posts_are_authoring_errors(self):
        for field, value in (
            ("title", "''"),
            ("date", "'2026-10-07'"),
            ("date", "2026-10-07T10:00:00"),
            ("date", "not-a-date"),
            ("topic", "''"),
            ("image", "https://example.test/cover.webp"),
            ("image", "//example.test/cover.webp"),
            ("image", "cover.webp"),
            ("author", "''"),
        ):
            with self.subTest(field=field, value=value):
                self.write_post("broken", **{field: value})
                with self.assertRaisesMessage(ImproperlyConfigured, "broken.md"):
                    self.client.get("/blog/")
        (self.posts / "broken.md").write_text("---\ntitle: Missing everything else\n---\n")
        with self.assertRaisesMessage(ImproperlyConfigured, "description is missing or invalid"):
            self.client.get("/blog/")

    def test_a_file_name_that_is_not_a_slug_is_an_authoring_error(self):
        self.write_post("Not_A_Slug")
        with self.assertRaisesMessage(ImproperlyConfigured, "Not_A_Slug.md"):
            self.client.get("/blog/")
