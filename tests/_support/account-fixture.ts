import { randomUUID } from 'node:crypto';
import { request } from 'playwright';
import { provisionDjangoUser } from '#tools/django-user';
import { createFixtureDocuments } from '#tools/fixture-document';
import { readFixtureState } from '#tools/fixtures';
import { resolveApiServerOrigin } from '#platform/net/origins';
import DEVELOPMENT_USERS from '../../backend/fixtures/development-users.json';
import { createTestAuthAccount } from './auth-account';
import { authenticateDjangoTestUser } from './django-auth';

/** Isolated copies of the ordinary development user; only Shared outline has a recipient. */
export async function createAccountFixture() {
  const instance = randomUUID();
  const owner = { ...DEVELOPMENT_USERS.user, email: createTestAuthAccount(`owner-${instance}`).email };
  const recipient = { ...DEVELOPMENT_USERS.user, email: createTestAuthAccount(`recipient-${instance}`).email };
  const privateOutline = { title: 'Private outline', fixture: 'tree' } as const;
  const sharedOutline = { title: 'Shared outline', fixture: 'flat' } as const;

  await Promise.all([provisionDjangoUser(owner), provisionDjangoUser(recipient)]);
  const [tree, flat] = await Promise.all([
    readFixtureState(privateOutline.fixture), readFixtureState(sharedOutline.fixture),
  ]);
  const [privateId, sharedId] = await createFixtureDocuments([
    { email: owner.email, title: privateOutline.title, content: tree },
    { email: owner.email, title: sharedOutline.title, content: flat },
  ]);

  const client = await request.newContext({ baseURL: resolveApiServerOrigin() });
  try {
    const csrfToken = await authenticateDjangoTestUser(client, resolveApiServerOrigin(), owner);
    await client.post(`/api/documents/${sharedId!}/access`, {
      headers: { 'X-CSRFToken': csrfToken },
      data: { email: recipient.email },
      failOnStatusCode: true,
    });
  } finally {
    await client.dispose();
  }

  return {
    owner,
    recipient,
    documents: {
      privateOutline: { ...privateOutline, id: privateId! },
      sharedOutline: { ...sharedOutline, id: sharedId! },
    },
  };
}

export type AccountFixture = Awaited<ReturnType<typeof createAccountFixture>>;
