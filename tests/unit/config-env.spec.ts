/* eslint-disable node/no-process-env */
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '#config/env/resolve';
import type { EnvKey } from '#config/env/schema';
import { CLIENT_KEY_LIST } from '#config/env/schema';

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

    expect(Object.keys(resolved.client).sort()).toEqual([...CLIENT_KEY_LIST].sort());
    expect(resolved.client.DEV_DOCUMENT_ID).toBe('testDevDoc');
    expect(resolved.client.COLLAB_ENABLED).toBe(true);
    expect(resolved.client).not.toHaveProperty('AUTH_SECRET');
    expect(resolved.client).not.toHaveProperty('AUTH_URL');
  });

  it('rejects a non-boolean COLLAB_ENABLED and names the variable', () => {
    expect(() => resolveTestConfig({ NODE_ENV: 'test', COLLAB_ENABLED: 'yes' })).toThrow(
      /COLLAB_ENABLED/,
    );
  });

  it('rejects a non-numeric PORT and names the variable', () => {
    expect(() => resolveTestConfig({ NODE_ENV: 'test', PORT: 'abc' })).toThrow(/PORT/);
  });

  it('matches tools/env.sh for derived collab port in dev', () => {
    const collabPort = readEnvShValue('COLLAB_SERVER_PORT', {
      NODE_ENV: 'development',
      PORT_BASE: '4000',
      PORT: '4000',
    });

    expect(collabPort).toBe('4004');
  });
});
