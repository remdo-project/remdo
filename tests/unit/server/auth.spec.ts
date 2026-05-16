import { describe, expect, it } from 'vitest';
import { resolveActor } from '@/server/auth/actor';
import { createTestResource } from '../_support/test-resource';
import { createServerAppHarness } from './_support/server-app-harness';

const createHarness = createTestResource(createServerAppHarness);

describe('server auth actor resolution', () => {
  it('returns null without a valid session', async () => {
    const harness = createHarness();

    const actor = await resolveActor(new Request('http://127.0.0.1/api/documents/main/token'), harness.auth);

    expect(actor).toBeNull();
  });

  it('returns a local-user actor for a valid Better Auth session', async () => {
    const harness = createHarness();

    const headers = await harness.createSessionHeaders();
    const actor = await resolveActor(
      new Request('http://127.0.0.1/api/documents/main/token', { headers }),
      harness.auth,
    );

    expect(actor).toMatchObject({
      email: 'server@example.com',
      name: 'Server Test User',
      type: 'local-user',
    });
    expect(actor?.userId).toBeTypeOf('string');
  });
});
