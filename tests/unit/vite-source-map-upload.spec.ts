import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const sentryVitePlugin = vi.hoisted(() => vi.fn((options: unknown) => ({ name: 'source-map-upload', options })));
vi.mock('@sentry/vite-plugin', () => ({ sentryVitePlugin }));

const DSN = 'https://public@s7.us-west-2a.betterstackdata.com/42';

async function loadHelper(env: Record<string, string>) {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.resetModules();
  return (await import('../../config/vite/source-map-upload')).sourceMapUpload;
}

beforeEach(() => {
  sentryVitePlugin.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('uploads source maps to the DSN application, found through the token\'s account', async () => {
  const fetchMock = vi.fn(() => Promise.resolve(Response.json({ data: { attributes: { team_id: 9, data_region: 'eu-test-1' } } })));
  vi.stubGlobal('fetch', fetchMock);

  const plugins = await (await loadHelper({ SENTRY_AUTH_TOKEN: 'secret', SENTRY_DSN: DSN, BUILD_REVISION: 'abc123' }))();

  expect(plugins).toHaveLength(1);
  expect(fetchMock).toHaveBeenCalledWith('https://errors.betterstack.com/api/v2/applications/42', {
    headers: { Authorization: 'Bearer secret' },
  });
  expect(sentryVitePlugin).toHaveBeenCalledWith(expect.objectContaining({
    authToken: 'secret',
    org: '9',
    project: '42',
    url: 'https://eu-test-1-sourcemaps.betterstackdata.com',
    release: expect.objectContaining({ name: 'abc123' }),
  }));
});

it.each([
  ['a token', { SENTRY_DSN: DSN, SENTRY_AUTH_TOKEN: '' }],
  ['a DSN', { SENTRY_AUTH_TOKEN: 'secret', SENTRY_DSN: '' }],
])('skips the upload without %s', async (_name, env) => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);

  expect(await (await loadHelper(env))()).toEqual([]);
  expect(fetchMock).not.toHaveBeenCalled();
});

it('fails the build when the application lookup is rejected', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(null, { status: 401 }))));

  await expect((await loadHelper({ SENTRY_AUTH_TOKEN: 'bad', SENTRY_DSN: DSN }))())
    .rejects.toThrow('Better Stack application 42 lookup failed with status 401');
});
