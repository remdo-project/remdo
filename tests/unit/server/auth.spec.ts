import { describe, expect, it } from 'vitest';
import { resolveActor, resolveActorResolution } from '#server/auth/actor';
import { normalizeSourceIssuer } from '#server/auth/auth';
import { createServerAppHarness } from './_support/server-app-harness';
import { createTestResource } from '../_support/test-resource';

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

describe('server auth cookie isolation', () => {
  it('keeps sessions for same-host stacks on different ports independent', async () => {
    const source = createServerAppHarness({ baseURL: 'http://localhost:4000' });
    const home = createServerAppHarness({ baseURL: 'http://localhost:4040' });

    try {
      const sourceCookie = (await source.createSessionHeaders()).get('cookie');
      const homeCookie = (await home.createSessionHeaders()).get('cookie');

      const browserCookies = new Headers({ cookie: `${sourceCookie}; ${homeCookie}` });
      await expect(source.auth.getSession(browserCookies)).resolves.toMatchObject({
        user: { email: 'server@example.com' },
      });
      await expect(home.auth.getSession(browserCookies)).resolves.toMatchObject({
        user: { email: 'server@example.com' },
      });
    } finally {
      await Promise.all([source.cleanup(), home.cleanup()]);
    }
  });
});

describe('normalizeSourceIssuer', () => {
  it('upgrades a non-loopback http source to https, mirroring Better Auth', () => {
    // A source served over http still advertises its issuer over https when the
    // host is not loopback; the home must expect that or issuer validation fails.
    expect(normalizeSourceIssuer('http://source.example')).toBe('https://source.example');
    expect(normalizeSourceIssuer('http://192.168.1.10:7070')).toBe('https://192.168.1.10:7070');
    // A DNS name that merely starts with "127." is public, not loopback.
    expect(normalizeSourceIssuer('http://127.example.com')).toBe('https://127.example.com');
  });

  it('leaves an https source unchanged', () => {
    expect(normalizeSourceIssuer('https://source.example')).toBe('https://source.example');
  });

  it('keeps http for loopback hosts (dev)', () => {
    expect(normalizeSourceIssuer('http://localhost:4000')).toBe('http://localhost:4000');
    expect(normalizeSourceIssuer('http://127.0.0.1:4000')).toBe('http://127.0.0.1:4000');
    expect(normalizeSourceIssuer('http://127.0.0.2:4000')).toBe('http://127.0.0.2:4000');
    expect(normalizeSourceIssuer('http://app.localhost:4000')).toBe('http://app.localhost:4000');
    expect(normalizeSourceIssuer('http://[::1]:4000')).toBe('http://[::1]:4000');
  });
});
