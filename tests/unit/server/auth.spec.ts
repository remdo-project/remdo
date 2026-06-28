import { describe, expect, it } from 'vitest';
import { config } from '#config';
import { resolveActor, resolveActorResolution } from '#server/auth/actor';
import { createTestResource } from '../_support/test-resource';
import { createServerAppHarness } from './_support/server-app-harness';

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
  it('accepts mutating auth requests from a local development alias', async () => {
    const harness = createHarness();
    const headers = await harness.createSessionHeaders();

    const response = await harness.app.request('/api/auth/sign-out', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: headers.get('cookie') ?? '',
        origin: 'http://localhost:4000',
      },
      body: '{}',
    });

    expect(response.status).toBe(200);
  });

  it('accepts mutating auth requests from a preview-port origin', async () => {
    // The harness auth (baseURL port 4000) also trusts the configured preview
    // port, so a request whose Origin is the preview app server is not rejected
    // as cross-origin — this is what lets a hostname-addressed `vite preview`
    // sign in instead of bouncing to the offline page.
    const harness = createHarness();
    const headers = await harness.createSessionHeaders();

    const response = await harness.app.request('/api/auth/sign-out', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: headers.get('cookie') ?? '',
        origin: `http://localhost:${config.env.PREVIEW_PORT}`,
      },
      body: '{}',
    });

    expect(response.status).toBe(200);
  });
});
