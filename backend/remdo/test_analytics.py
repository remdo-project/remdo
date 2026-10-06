from django.test import TestCase, override_settings


class AnalyticsMarkupTests(TestCase):
    def test_unconfigured_pages_emit_no_analytics_ui(self):
        for path in ("/", "/about/", "/n/example"):
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertNotContains(response, "data-analytics-consent")
                self.assertNotContains(response, "data-analytics-settings")
                self.assertNotContains(response, "cloud.umami.is/script.js")

    @override_settings(UMAMI_WEBSITE_ID="analytics-website-id")
    def test_configured_pages_offer_consent_before_loading_umami(self):
        for path in ("/", "/about/", "/n/example"):
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertContains(
                    response,
                    'data-analytics-website-id="analytics-website-id"',
                )
                self.assertContains(response, "data-analytics-allow")
                self.assertContains(response, "data-analytics-deny")
                self.assertContains(response, "data-analytics-settings")
                self.assertContains(response, "https://cloud.umami.is/script.js")
                self.assertNotContains(
                    response,
                    '<script src="https://cloud.umami.is/script.js"',
                )
