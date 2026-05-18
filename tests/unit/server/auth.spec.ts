import { describe, expect, it } from 'vitest';
import { resolveActor } from '@/server/auth/actor';
import { createAuthTrustedOrigins } from '@/server/auth/auth';
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

describe('server auth trusted origins', () => {
  it('adds local development aliases for the configured app port', () => {
    expect(createAuthTrustedOrigins('http://127.0.0.1:4000', {
      machineHostname: 'dev-vm',
      mode: 'development',
    })).toEqual([
      'http://127.0.0.1:4000',
      'http://localhost:4000',
      'http://dev-vm:4000',
    ]);
  });

  it('keeps production restricted to the configured public origin', () => {
    expect(createAuthTrustedOrigins('https://remdo.example.com', {
      machineHostname: 'dev-vm',
      mode: 'production',
    })).toEqual(['https://remdo.example.com']);
  });

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
});
