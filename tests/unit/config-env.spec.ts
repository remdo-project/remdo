/* eslint-disable node/no-process-env */
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '#config/env/resolve';
import { CLIENT_KEY_LIST, envSchema } from '#config/env/schema';
import type { EnvKey } from '#config/env/schema';

type EnvValues = Partial<Record<EnvKey, string | boolean>>;

function resolveTestConfig(values: EnvValues, options?: Parameters<typeof resolveConfig>[1]) {
  return resolveConfig((key) => values[key], options);
}

function readEnvShValue(name: string, overrides: NodeJS.ProcessEnv): string {
  const env = { ...process.env, ...overrides };
  delete env.AUTH_URL;
  delete env.LINKABLE_REMDO_SERVERS_JSON;
  delete env.REMDO_DEV_HOME_ORIGIN;
  // The dev shell exports already-derived ports; drop them so env.sh re-derives
  // from the overridden PORT_BASE instead of echoing the inherited value.
  delete env.COLLAB_SERVER_PORT;
  if (!('PORT' in overrides)) {
    delete env.PORT;
  }

  return execFileSync('./tools/env.sh', ['sh', '-c', `printf '%s' "$${name}"`], {
    env,
    encoding: 'utf8',
  });
}

describe('config env resolve', () => {
  it('reads DATA_DIR from env inputs', () => {
    const resolved = resolveTestConfig({
      NODE_ENV: 'test',
      DATA_DIR: '/repo/data',
    });

    expect(resolved.server.DATA_DIR).toBe('/repo/data');
  });

  it('requires NODE_ENV', () => {
    expect(() => resolveTestConfig({})).toThrow(
      'NODE_ENV is required; run via tools/env.sh.',
    );
  });

  it('treats empty-string NODE_ENV as missing', () => {
    expect(() => resolveTestConfig({ NODE_ENV: '' })).toThrow(
      'NODE_ENV is required; run via tools/env.sh.',
    );
  });

  it('derives AUTH_URL from HOST and PORT outside production', () => {
    const resolved = resolveTestConfig({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: '4000',
    });

    expect(resolved.server.AUTH_URL).toBe('http://127.0.0.1:4000');
  });

  it('localhostizes 0.0.0.0 when local services bind all interfaces', () => {
    const resolved = resolveTestConfig({
      NODE_ENV: 'development',
      HOST: '0.0.0.0',
      PORT: '4000',
    });

    expect(resolved.server.AUTH_URL).toBe('http://localhost:4000');
  });

  it('localhostizes :: when local services bind all interfaces', () => {
    const resolved = resolveTestConfig({
      NODE_ENV: 'development',
      HOST: '::',
      PORT: '4000',
    });

    expect(resolved.server.AUTH_URL).toBe('http://localhost:4000');
  });

  it('prefers the local URL outside production when APP_PUBLIC_URL is set', () => {
    const resolved = resolveTestConfig({
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: '4000',
      APP_PUBLIC_URL: 'https://remdo.example.com',
    });

    expect(resolved.server.AUTH_URL).toBe('http://127.0.0.1:4000');
  });

  it('uses an explicit absolute AUTH_URL when provided', () => {
    const resolved = resolveTestConfig({
      NODE_ENV: 'development',
      AUTH_URL: 'https://remdo.example.test',
      HOST: '0.0.0.0',
      PORT: '4000',
    });

    expect(resolved.server.AUTH_URL).toBe('https://remdo.example.test');
  });

  it('uses APP_PUBLIC_URL for AUTH_URL in production server config', () => {
    const resolved = resolveTestConfig({
      NODE_ENV: 'production',
      AUTH_SECRET: 'production-auth-secret-0123456789',
      ADMIN_SECRET: 'production-admin-secret-0123456789',
      APP_PUBLIC_URL: 'https://remdo.example.com',
    });

    expect(resolved.server.AUTH_URL).toBe('https://remdo.example.com');
  });

  it('derives dev auth trusted origins for the app port and preview port', () => {
    const resolved = resolveTestConfig({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: '4000',
      PREVIEW_PORT: '4005',
    }, { machineHostname: 'dev-vm' });

    expect(resolved.server.AUTH_TRUSTED_ORIGINS).toEqual([
      'http://127.0.0.1:4000',
      'http://localhost:4000',
      'http://dev-vm:4000',
      'http://localhost:4005',
      'http://127.0.0.1:4005',
      'http://dev-vm:4005',
    ]);
  });

  it('derives trusted origins from an explicit AUTH_URL on a non-default port', () => {
    // createServerAuth re-derives from its own baseURL, so an overridden
    // AUTH_URL must drive the trusted-origin aliases (not the default port).
    const resolved = resolveTestConfig({
      NODE_ENV: 'development',
      AUTH_URL: 'http://127.0.0.1:6100',
      PREVIEW_PORT: '6105',
    }, { machineHostname: 'dev-vm' });

    expect(resolved.server.AUTH_TRUSTED_ORIGINS).toEqual([
      'http://127.0.0.1:6100',
      'http://localhost:6100',
      'http://dev-vm:6100',
      'http://localhost:6105',
      'http://127.0.0.1:6105',
      'http://dev-vm:6105',
    ]);
  });

  it('omits preview-port aliases when it matches the app port', () => {
    const resolved = resolveTestConfig({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: '4000',
      PREVIEW_PORT: '4000',
    }, { machineHostname: 'dev-vm' });

    expect(resolved.server.AUTH_TRUSTED_ORIGINS).toEqual([
      'http://127.0.0.1:4000',
      'http://localhost:4000',
      'http://dev-vm:4000',
    ]);
  });

  it('restricts auth trusted origins to the public origin in production', () => {
    const resolved = resolveTestConfig({
      NODE_ENV: 'production',
      AUTH_SECRET: 'production-auth-secret-0123456789',
      ADMIN_SECRET: 'production-admin-secret-0123456789',
      APP_PUBLIC_URL: 'https://remdo.example.com',
    }, { machineHostname: 'dev-vm' });

    expect(resolved.server.AUTH_TRUSTED_ORIGINS).toEqual(['https://remdo.example.com']);
  });

  it('rejects a short AUTH_SECRET in production server config', () => {
    expect(() => resolveTestConfig({
      NODE_ENV: 'production',
      AUTH_SECRET: 'too-short',
    })).toThrow('AUTH_SECRET must be at least 32 characters long in production.');
  });

  it('requires production server secrets and an absolute canonical public URL', () => {
    expect(() => resolveTestConfig({
      NODE_ENV: 'production',
      AUTH_SECRET: 'production-auth-secret-0123456789',
    })).toThrow('APP_PUBLIC_URL is required in production server config.');

    expect(() => resolveTestConfig({
      NODE_ENV: 'production',
      AUTH_SECRET: 'production-auth-secret-0123456789',
      APP_PUBLIC_URL: 'https://remdo.example.com',
    })).toThrow('ADMIN_SECRET is required in production server config.');

    expect(() => resolveTestConfig({
      NODE_ENV: 'production',
      APP_PUBLIC_URL: ':8080',
      AUTH_SECRET: 'production-auth-secret-0123456789',
      ADMIN_SECRET: 'production-admin-secret-0123456789',
    })).toThrow('APP_PUBLIC_URL must be an absolute http(s) URL in production server config.');
  });

  it('does not require the auto-bootstrapped Y-Sweet pair in production server config', () => {
    // Both Y-Sweet secrets are bootstrapped, and the API process is started
    // without YSWEET_AUTH_KEY, so neither is validated at the config boundary.
    const resolved = resolveTestConfig({
      NODE_ENV: 'production',
      AUTH_SECRET: 'production-auth-secret-0123456789',
      ADMIN_SECRET: 'production-admin-secret-0123456789',
      APP_PUBLIC_URL: 'https://remdo.example.com',
    });

    expect(resolved.server.YSWEET_AUTH_KEY).toBe('');
    expect(resolved.server.YSWEET_SERVER_TOKEN).toBe('');
  });

  it('allows production utility config without app auth secrets', () => {
    const resolved = resolveTestConfig({
      NODE_ENV: 'production',
    });

    expect(resolved.runtime.mode).toBe('production');
    expect(resolved.runtime.isProd).toBe(true);
    expect(resolved.runtime.isDev).toBe(false);
    expect(resolved.server.AUTH_URL).toBe('');
  });

  it('skips server-only auth validation for browser config loading', () => {
    const resolved = resolveTestConfig({
      NODE_ENV: 'production',
      AUTH_SECRET: 'too-short',
    }, { server: false });

    expect(resolved.runtime.mode).toBe('production');
  });

  it('exposes exactly the CLIENT_KEYS subset to the client config', () => {
    const resolved = resolveTestConfig({
      NODE_ENV: 'test',
      DEV_DOCUMENT_ID: 'testDevDoc',
      HOST: '127.0.0.1',
      PORT: '4000',
      COLLAB_ENABLED: 'true',
      YSWEET_SERVER_TOKEN: 'test-ysweet-server-token',
      AUTH_SECRET: 'test-auth-secret-0123456789',
      ADMIN_SECRET: 'test-admin-secret-0123456789',
      APP_PUBLIC_URL: 'https://remdo.example.com',
    });

    // Assert against a hardcoded literal, not CLIENT_KEY_LIST: pickClientEnv
    // builds the client from CLIENT_KEY_LIST, so comparing against it would be
    // tautological and could not catch a server secret wrongly added to the list.
    expect(Object.keys(resolved.client).sort()).toEqual(['COLLAB_ENABLED', 'DEV_DOCUMENT_ID']);
    expect(resolved.client.DEV_DOCUMENT_ID).toBe('testDevDoc');
    expect(resolved.client.COLLAB_ENABLED).toBe(true);
    // No server-only value may reach the client config (it feeds the browser
    // bundle). Derive the server keys from the schema so this can't drift: every
    // schema key that is not a client key must be absent from the client.
    const clientKeys = new Set<string>(CLIENT_KEY_LIST);
    const serverOnlyKeys = Object.keys(envSchema).filter((key) => !clientKeys.has(key));
    expect(serverOnlyKeys).toContain('AUTH_SECRET'); // sanity: the filter found server keys
    for (const serverKey of serverOnlyKeys) {
      expect(resolved.client).not.toHaveProperty(serverKey);
    }
  });

  it('rejects a non-boolean COLLAB_ENABLED and names the variable', () => {
    expect(() => resolveTestConfig({ NODE_ENV: 'test', COLLAB_ENABLED: 'yes' })).toThrow(
      /COLLAB_ENABLED/,
    );
  });

  it('rejects a non-numeric PORT and names the variable', () => {
    expect(() => resolveTestConfig({ NODE_ENV: 'test', PORT: 'abc' })).toThrow(/PORT/);
  });

  it('treats a whitespace-only value as unset and falls back to the schema default', () => {
    // A whitespace-only string must resolve to the default, not pass through
    // (a string key keeps '' rather than '   '; a port key stays unset, not 0
    // from Number('   ')). DATA_DIR is a string key that makes this observable.
    const resolved = resolveTestConfig({ NODE_ENV: 'test', DATA_DIR: '   ', HOST: '  ' });
    expect(resolved.server.DATA_DIR).toBe('');
    expect(resolved.server.HOST).toBe('');
  });

  it('matches tools/env.sh for derived collab port in dev', () => {
    const collabPort = readEnvShValue('COLLAB_SERVER_PORT', {
      NODE_ENV: 'development',
      PORT_BASE: '4000',
      PORT: '4000',
    });

    expect(collabPort).toBe('4004');
  });

  it('does not configure linkable RemDo servers for normal dev by default', () => {
    const linkable = readEnvShValue('LINKABLE_REMDO_SERVERS_JSON', {
      NODE_ENV: 'development',
      PORT_BASE: '4000',
      PORT: '4000',
    });

    expect(linkable).toBe('');
  });

  it('uses the un-prefixed ALLOW_SIGNUP key (no auth-prefixed variant)', () => {
    expect(envSchema).toHaveProperty('ALLOW_SIGNUP');
    expect(envSchema).not.toHaveProperty('AUTH_ALLOW_SIGNUP');
  });
});
