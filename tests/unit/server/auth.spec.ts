import { describe, expect, it } from 'vitest';
import { resolveActor } from '@/server/auth/actor';
import { createServerAppHarness } from './_support/server-app-harness';

describe('server auth actor resolution', () => {
  it('returns null without a valid session', async () => {
    const harness = createServerAppHarness();

    try {
      const actor = await resolveActor(new Request('http://127.0.0.1/api/documents/main/token'), harness.auth);

      expect(actor).toBeNull();
    } finally {
      harness.cleanup();
    }
  });

  it('returns a local-user actor for a valid Better Auth session', async () => {
    const harness = createServerAppHarness();

    try {
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
    } finally {
      harness.cleanup();
    }
  });
});
