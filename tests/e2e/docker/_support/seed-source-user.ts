import { DOCKER_TEST_AUTH } from '#tools/docker-test-auth';
import { sourceOrigin } from './origins';

// Playwright global setup: the source runs with ALLOW_SIGNUP=true, so the
// Docker source user is seeded over its own signup endpoint once both source
// servers are ready. Seeding through HTTP rather than a second server runtime
// keeps a single owner of the source database.
export default async function seedSourceUser(): Promise<void> {
  const response = await fetch(new URL('/api/auth/sign-up/email', sourceOrigin), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // Better Auth rejects a mutating request without a trusted Origin; the
      // source's own origin is always in its trusted list.
      'origin': sourceOrigin,
    },
    body: JSON.stringify(DOCKER_TEST_AUTH),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to create Docker source user ${DOCKER_TEST_AUTH.email}: ${response.status} ${await response.text()}`,
    );
  }
}
