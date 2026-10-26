import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@sentry/vite-plugin', () => ({
  sentryVitePlugin: (options: unknown) => ({ name: 'source-map-upload', options }),
}));

const DSN = 'https://public@s7.us-west-2a.betterstackdata.com/42';

async function runUpload(command: 'build' | 'serve', env: Record<string, string>) {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.resetModules();
  const { sourceMapUpload } = await import('../../config/vite/source-map-upload');
  return sourceMapUpload(command);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('uploads source maps to the DSN application, found through the token\'s account', async () => {
  const fetchMock = vi.fn(() => Promise.resolve(Response.json({ data: { attributes: { team_id: 9, data_region: 'eu-test-1' } } })));
  vi.stubGlobal('fetch', fetchMock);

  const plugins = await runUpload('build', { SENTRY_AUTH_TOKEN: 'secret', SENTRY_DSN: DSN, BUILD_REVISION: 'abc123' });

  expect(fetchMock).toHaveBeenCalledWith('https://errors.betterstack.com/api/v2/applications/42', {
    headers: { Authorization: 'Bearer secret' },
  });
  expect(plugins).toEqual([{
    name: 'source-map-upload',
    options: expect.objectContaining({
      authToken: 'secret',
      org: '9',
      project: '42',
      url: 'https://eu-test-1-sourcemaps.betterstackdata.com',
      release: expect.objectContaining({ name: 'abc123' }),
    }),
  }]);
});

it.each([
  ['without a token', 'build', { SENTRY_DSN: DSN, SENTRY_AUTH_TOKEN: '' }],
  ['without a DSN', 'build', { SENTRY_AUTH_TOKEN: 'secret', SENTRY_DSN: '' }],
  ['outside a build', 'serve', { SENTRY_AUTH_TOKEN: 'secret', SENTRY_DSN: DSN }],
] as const)('skips the upload %s', async (_name, command, env) => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);

  expect(await runUpload(command, env)).toEqual([]);
  expect(fetchMock).not.toHaveBeenCalled();
});

it('fails the build when the application lookup is rejected', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(null, { status: 401 }))));

  await expect(runUpload('build', { SENTRY_AUTH_TOKEN: 'bad', SENTRY_DSN: DSN }))
    .rejects.toThrow('Better Stack application 42 lookup failed with status 401');
});
