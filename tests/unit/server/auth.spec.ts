import { describe, expect, it } from 'vitest';
import { resolveActor, resolveActorResolution } from '#server/auth/actor';
import { createTestResource } from '../_support/test-resource';
import { createServerAppHarness, TEST_PREVIEW_PORT } from './_support/server-app-harness';

const createHarness = createTestResource(createServerAppHarness);

describe('server auth actor resolution', () => {
  it('returns null without a valid session', async () => {
    const harness = createHarness();

    const actor = await resolveActor(new Request('http://127.0.0.1/api/documents/main/sync-tokens'), harness.auth);

    expect(actor).toBeNull();
  });

  it('returns a local-user actor for a valid Better Auth session', async () => {
    const harness = createHarness();

    const headers = await harness.createSessionHeaders();
    const actor = await resolveActor(
      new Request('http://127.0.0.1/api/documents/main/sync-tokens', { headers }),
      harness.auth,
    );

    expect(actor).toMatchObject({
      email: 'server@example.com',
      name: 'Server Test User',
      type: 'local-user',
    });
    expect(actor?.userId).toBeTypeOf('string');
  });

  it('resolves bearer actors without requiring a cookie session', async () => {
    const harness = createHarness();
    harness.auth.getSession = async () => {
      throw new Error('session lookup should not run for bearer requests');
    };
    harness.auth.resolveBearerUser = async () => ({
      email: 'source@example.test',
      id: 'source-user',
      name: 'Source User',
    });

    const resolution = await resolveActorResolution(
      new Request('http://127.0.0.1/api/current-user', {
        headers: {
          authorization: 'Bearer source-token',
        },
      }),
      harness.auth,
    );

    expect(resolution).toEqual({
      actor: {
        email: 'source@example.test',
        name: 'Source User',
        type: 'local-user',
        userId: 'source-user',
      },
      credential: 'bearer',
    });
    await expect(resolveActor(
      new Request('http://127.0.0.1/api/current-user', {
        headers: {
          authorization: 'Bearer source-token',
        },
      }),
      harness.auth,
    )).resolves.toEqual({
      email: 'source@example.test',
      name: 'Source User',
      type: 'local-user',
      userId: 'source-user',
    });
  });
});

describe('server auth trusted origins', () => {
  // Better Auth auto-disables its origin/CSRF check under NODE_ENV=test
  // (`skipOriginCheck: isTest() ? true`), so a sign-out request through the
  // harness accepts ANY Origin and cannot exercise trusted-origin enforcement.
  // The derivation itself is covered behaviorally in config-env.spec.ts; here we
  // assert the wiring — that the harness builds the trusted-origin list from its
  // own baseURL + preview port and hands it to auth, including the preview-port
  // origin that lets a hostname-addressed `vite preview` sign in.
  it('builds trusted origins from the harness baseURL and preview port', () => {
    const harness = createHarness();
    expect(harness.trustedOrigins).toEqual([
      'http://127.0.0.1:4000',
      'http://localhost:4000',
      'http://test-host:4000',
      `http://localhost:${TEST_PREVIEW_PORT}`,
      `http://127.0.0.1:${TEST_PREVIEW_PORT}`,
      `http://test-host:${TEST_PREVIEW_PORT}`,
    ]);
  });
});
