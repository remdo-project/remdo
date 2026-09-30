from django.test import SimpleTestCase, override_settings


class OpenAIAppsChallengeTests(SimpleTestCase):
    @override_settings(OPENAI_APPS_CHALLENGE="  verification-token.<&>\n")
    def test_anonymous_get_returns_exact_token_as_plain_text(self):
        response = self.client.get("/.well-known/openai-apps-challenge")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/plain")
        self.assertEqual(response.content, b"  verification-token.<&>\n")

    @override_settings(OPENAI_APPS_CHALLENGE="")
    def test_unconfigured_challenge_returns_not_found(self):
        response = self.client.get("/.well-known/openai-apps-challenge")

        self.assertEqual(response.status_code, 404)

    @override_settings(OPENAI_APPS_CHALLENGE="verification-token")
    def test_post_is_not_allowed(self):
        response = self.client.post("/.well-known/openai-apps-challenge")

        self.assertEqual(response.status_code, 405)
