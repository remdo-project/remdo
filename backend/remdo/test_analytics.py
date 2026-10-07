from django.test import TestCase, override_settings

PAGES = ("/", "/about/", "/n/example")


class AnalyticsMarkupTests(TestCase):
    def test_unconfigured_pages_emit_no_analytics(self):
        for path in PAGES:
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertNotContains(response, "cloud.umami.is/script.js")
                self.assertNotContains(response, "data-analytics-panel")
                self.assertNotContains(response, "data-analytics-settings")

    @override_settings(
        UMAMI_WEBSITE_ID="analytics-website-id", APP_ORIGIN="https://app.example.test:8443"
    )
    def test_configured_pages_load_the_tracker_for_the_app_host_and_offer_settings(self):
        for path in PAGES:
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertContains(response, 'src="https://cloud.umami.is/script.js"')
                self.assertContains(response, 'data-website-id="analytics-website-id"')
                self.assertContains(response, 'data-domains="app.example.test"')
                self.assertContains(response, "data-analytics-panel")
                self.assertContains(response, "data-analytics-toggle")
                self.assertContains(response, "data-analytics-settings")

    @override_settings(UMAMI_WEBSITE_ID="analytics-website-id", FRONTEND_USE_SOURCE=True)
    def test_tracker_loads_before_the_app_scripts(self):
        content = self.client.get("/n/example").content.decode()
        self.assertLess(
            content.index("cloud.umami.is/script.js"), content.index('<script type="module"')
        )
