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

  it('derives APP_PUBLIC_URL from HOST and PORT outside production', () => {
    const resolved = resolveTestConfig({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: '4000',
    });

    expect(resolved.server.APP_PUBLIC_URL).toBe('http://127.0.0.1:4000');
  });

  it('uses the machine hostname when local services bind all IPv4 interfaces', () => {
    const resolved = resolveTestConfig({
      NODE_ENV: 'development',
      HOST: '0.0.0.0',
      PORT: '4000',
    }, { machineHostname: 'dev-vm' });

    expect(resolved.server.APP_PUBLIC_URL).toBe('http://dev-vm:4000');
  });

  it('uses the machine hostname when local services bind all IPv6 interfaces', () => {
    const resolved = resolveTestConfig({
      NODE_ENV: 'development',
      HOST: '::',
      PORT: '4000',
    }, { machineHostname: 'dev-vm' });

    expect(resolved.server.APP_PUBLIC_URL).toBe('http://dev-vm:4000');
  });

  it('uses PUBLIC_HOST outside production and ignores production APP_PUBLIC_URL input', () => {
    const resolved = resolveTestConfig({
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PUBLIC_HOST: 'browser-visible.test',
      PORT: '4000',
      APP_PUBLIC_URL: 'https://remdo.example.com',
    });

    expect(resolved.server.APP_PUBLIC_URL).toBe('http://browser-visible.test:4000');
  });

  it('formats an IPv6 PUBLIC_HOST for use in a URL', () => {
    const resolved = resolveTestConfig({
      NODE_ENV: 'development',
      HOST: '::',
      PUBLIC_HOST: '2001:db8::1',
      PORT: '4000',
    });

    expect(resolved.server.APP_PUBLIC_URL).toBe('http://[2001:db8::1]:4000');
  });

  it('uses APP_PUBLIC_URL as the canonical production URL', () => {
    const resolved = resolveTestConfig({
      NODE_ENV: 'production',
      AUTH_SECRET: 'production-auth-secret-0123456789',
      ADMIN_SECRET: 'production-admin-secret-0123456789',
      APP_PUBLIC_URL: 'https://remdo.example.com',
    });

    expect(resolved.server.APP_PUBLIC_URL).toBe('https://remdo.example.com');
  });

  it('derives dev auth trusted origins for the current stack port', () => {
    const resolved = resolveTestConfig({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: '4000',
    }, { machineHostname: 'dev-vm' });

    expect(resolved.server.AUTH_TRUSTED_ORIGINS).toEqual([
      'http://127.0.0.1:4000',
      'http://localhost:4000',
      'http://dev-vm:4000',
    ]);
  });

  it('fails clearly when wildcard binding has no browser-visible hostname', () => {
    expect(() => resolveTestConfig({
      NODE_ENV: 'development',
      HOST: '0.0.0.0',
      PORT: '4000',
    }, { machineHostname: 'localhost' })).toThrow('PUBLIC_HOST is required when HOST binds all interfaces');
  });

  it('rejects a URL-shaped PUBLIC_HOST', () => {
    expect(() => resolveTestConfig({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PUBLIC_HOST: 'https://dev.example.test',
      PORT: '4000',
    })).toThrow('PUBLIC_HOST must be a bare hostname or IP address');
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
    expect(resolved.server.APP_PUBLIC_URL).toBe('');
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

  it('launches an entire local stack in an offset port range', () => {
    const env = {
      ...process.env,
      NODE_ENV: 'development',
      PORT_BASE: '4000',
      PORT: '9000',
      COLLAB_SERVER_PORT: '9004',
      API_SERVER_PORT: '9011',
      YSWEET_CONNECTION_STRING: 'ys://127.0.0.1:9004',
    };
    const output = execFileSync(
      './tools/env.sh',
      [
        '--port-base-offset',
        '50',
        'sh',
        '-c',
        'printf \'%s\\n\' "$PORT_BASE" "$PORT" "$COLLAB_SERVER_PORT" "$API_SERVER_PORT" "$YSWEET_CONNECTION_STRING"',
      ],
      { env, encoding: 'utf8' },
    );

    expect(output.trim().split('\n')).toEqual([
      '4050',
      '4050',
      '4054',
      '4061',
      'ys://127.0.0.1:4054',
    ]);
  });

  it('recomputes every derived dev port instead of inheriting stale values', () => {
    const output = execFileSync(
      './tools/env.sh',
      ['sh', '-c', 'printf \'%s\\n\' "$PORT" "$VITEST_PORT" "$COLLAB_SERVER_PORT" "$API_SERVER_PORT" "$YSWEET_CONNECTION_STRING"'],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_ENV: 'development',
          PORT_BASE: '4300',
          PORT: '9000',
          VITEST_PORT: '9002',
          COLLAB_SERVER_PORT: '9004',
          API_SERVER_PORT: '9011',
          YSWEET_CONNECTION_STRING: 'ys://127.0.0.1:9004',
        },
      },
    );

    expect(output.trim().split('\n')).toEqual([
      '4300',
      '4302',
      '4304',
      '4311',
      'ys://127.0.0.1:4304',
    ]);
  });

  it('rejects a port-base offset with a leading zero', () => {
    expect(() => execFileSync(
      './tools/env.sh',
      ['--port-base-offset', '08', 'true'],
      { encoding: 'utf8' },
    )).toThrow();
  });

  it('uses the un-prefixed ALLOW_SIGNUP key (no auth-prefixed variant)', () => {
    expect(envSchema).toHaveProperty('ALLOW_SIGNUP');
    expect(envSchema).not.toHaveProperty('AUTH_ALLOW_SIGNUP');
  });
});
