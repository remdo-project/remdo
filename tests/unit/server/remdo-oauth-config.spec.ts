import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServerAuth } from '#server/auth/auth';
import type { SqliteServerDatabaseClient } from '#server/db/client';
import { createServerDatabaseClient } from '#server/db/client';
import { decodeSourceId, deriveSourceId, deriveSourceServer } from '#server/remdo-oauth/config';
import type { StoredSourceServer } from '#server/remdo-oauth/source-server-store';

const HOME_ORIGIN = 'http://127.0.0.1:4000';
const SOURCE_ORIGIN = 'https://source.example';
const SOURCE_ID = deriveSourceId(SOURCE_ORIGIN);
const SOURCE_SERVER = {
  baseUrl: SOURCE_ORIGIN,
  credentials: { clientId: 'public-client-id' },
  id: SOURCE_ID,
  label: 'source.example',
} as const satisfies StoredSourceServer;

// Mirrors the plugin-inspection pattern in swappable-auth.spec.ts: the built
// genericOAuth provider config is the only place that proves what actually gets
// sent to Better Auth, so assert on it directly rather than on inputs.
function genericOAuthProviderConfigs(
  auth: ReturnType<typeof createServerAuth>['auth'],
): { clientSecret?: string | null; pkce?: boolean; providerId: string }[] {
  const options = auth.options as { plugins?: { id?: string; options?: { config?: { clientSecret?: string | null; pkce?: boolean; providerId: string }[] } }[] };
  const genericOAuth = options.plugins?.find((plugin) => plugin.id === 'generic-oauth');
  return genericOAuth?.options?.config ?? [];
}

describe('deriveSourceServer', () => {
  it('derives a source entry from a bare-origin URL', () => {
    const entry = deriveSourceServer('https://source.example');
    expect(entry).toMatchObject({
      label: 'source.example',
      baseUrl: 'https://source.example',
    });
    // The id reversibly encodes the full origin.
    expect(decodeSourceId(entry.id)).toBe('https://source.example');
  });

  it('rejects anything that is not a bare http(s) origin with one actionable error', () => {
    for (const invalid of [
      'https://source.example/path', // carries a path
      'not-a-url', // unparseable
      'ftp://source.example', // wrong scheme
      'ws://source.example',
    ]) {
      expect(() => deriveSourceServer(invalid), invalid).toThrow('bare http(s) origin');
    }
  });
});

describe('deriveSourceId', () => {
  it('is a URL-safe, path-segment-safe encoding', () => {
    const id = deriveSourceId('https://source.example:8443');
    expect(id).toMatch(/^[\w-]+$/u);
  });

  it('gives distinct ids to origins differing only by scheme or port', () => {
    expect(deriveSourceId('https://source.example')).not.toBe(deriveSourceId('http://source.example'));
    expect(deriveSourceId('https://source.example')).not.toBe(deriveSourceId('https://source.example:8443'));
  });

  it('gives distinct ids to origins differing only in punctuation', () => {
    // A slug that collapsed punctuation would alias these; the encoding must not.
    expect(deriveSourceId('https://foo-bar.example')).not.toBe(deriveSourceId('https://foo.bar.example'));
  });

  it('decodes only canonical ids containing bare http(s) origins', () => {
    expect(decodeSourceId(deriveSourceId('https://source.example:8443')))
      .toBe('https://source.example:8443');
    expect(decodeSourceId(deriveSourceId('https://source.example/path'))).toBeNull();
    expect(decodeSourceId('not-a-source-id')).toBeNull();
  });
});

// A source registered as a public client stores only a client_id (no secret);
// the built genericOAuth provider must still exist and authenticate via PKCE
// alone, per docs/access-model.md#linking-a-source.
describe('genericOAuth provider for a public-client source', () => {
  let database: SqliteServerDatabaseClient;
  let serverAuth: ReturnType<typeof createServerAuth>;

  beforeEach(() => {
    database = createServerDatabaseClient({ dbPath: ':memory:' });
    serverAuth = createServerAuth({
      allowSignup: false,
      baseURL: HOME_ORIGIN,
      database,
      secret: 'test-better-auth-secret-0123456789',
      sourceServers: [SOURCE_SERVER],
    });
  });

  afterEach(async () => {
    await serverAuth.ensureReady();
    await database.close();
    vi.unstubAllGlobals();
  });

  function responseCookies(response: Response, existing = ''): string {
    return [
      existing,
      ...response.headers.getSetCookie().map((cookie) => cookie.split(';', 1)[0]),
    ].filter(Boolean).join('; ');
  }

  function stubSourceOAuthUser(email: string) {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/api/auth/oauth2/token')) {
        return Response.json({
          access_token: 'source-access-token',
          token_type: 'Bearer',
        });
      }
      if (url.endsWith('/api/auth/oauth2/userinfo')) {
        return Response.json({
          sub: 'source-user-id',
          email,
          email_verified: true,
          name: 'Source User',
        });
      }
      throw new Error(`Unexpected OAuth request: ${url}`);
    }));
  }

  async function completeSourceOAuth(start: Response, existingCookies = ''): Promise<Response> {
    const authorizationUrl = new URL((await start.json() as { url: string }).url);
    const callbackUrl = new URL(`/api/auth/callback/${SOURCE_ID}`, serverAuth.baseURL);
    callbackUrl.searchParams.set('code', 'source-code');
    callbackUrl.searchParams.set('state', authorizationUrl.searchParams.get('state')!);
    callbackUrl.searchParams.set('iss', SOURCE_ORIGIN);
    return serverAuth.auth.handler(new Request(callbackUrl, {
      headers: { cookie: responseCookies(start, existingCookies) },
    }));
  }

  async function createLocalUser(email: string): Promise<Response> {
    const response = await serverAuth.createUser({
      email,
      name: 'Local User',
      password: 'local-password-1234',
    }, new Headers());
    expect(response.ok).toBe(true);
    return response;
  }

  it('builds a provider that omits clientSecret and keeps pkce true', () => {
    const configs = genericOAuthProviderConfigs(serverAuth.auth);
    expect(configs).toHaveLength(1);
    expect(configs[0]?.providerId).toBe(SOURCE_ID);
    expect(configs[0]?.pkce).toBe(true);
    expect(configs[0]?.clientSecret).toBeUndefined();
  });

  it('does not implicitly link a same-email source account during normal sign-in', async () => {
    await serverAuth.ensureReady();
    const authContext = await serverAuth.auth.$context;
    using _loggerErrorSpy = vi.spyOn(authContext.logger, 'error').mockImplementation(() => {});
    const email = 'same-email@example.com';
    await createLocalUser(email);
    database.sqlite.prepare('UPDATE user SET emailVerified = 1 WHERE email = ?').run(email);
    stubSourceOAuthUser(email);
    const signIn = await serverAuth.auth.api.signInSocial({
      body: {
        callbackURL: '/done',
        provider: SOURCE_ID,
      },
      asResponse: true,
    });
    const callback = await completeSourceOAuth(signIn);

    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toContain('error=account_not_linked');
    const linkedAccounts = database.sqlite
      .prepare('SELECT providerId FROM account WHERE providerId = ?')
      .all(SOURCE_ID);
    expect(linkedAccounts).toEqual([]);
  });

  it('explicitly links a source account with a different email', async () => {
    await serverAuth.ensureReady();
    const homeEmail = 'home@example.com';
    const sourceEmail = 'source@example.com';
    const createUser = await createLocalUser(homeEmail);
    const sessionCookies = responseCookies(createUser);
    stubSourceOAuthUser(sourceEmail);
    const link = await serverAuth.auth.api.linkSocialAccount({
      body: {
        callbackURL: '/done',
        provider: SOURCE_ID,
      },
      headers: new Headers({ cookie: sessionCookies }),
      asResponse: true,
    });

    const callback = await completeSourceOAuth(link, sessionCookies);

    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toBe('/done');
    const localUser = await serverAuth.findUserByEmail(homeEmail);
    const linkedAccount = database.sqlite
      .prepare('SELECT providerId, userId FROM account WHERE providerId = ?')
      .get(SOURCE_ID);
    expect(linkedAccount).toEqual({
      providerId: SOURCE_ID,
      userId: localUser!.id,
    });
  });
});
