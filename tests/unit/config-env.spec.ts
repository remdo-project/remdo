import { describe, expect, it } from 'vitest';
import { loadEnv } from '#config/_internal/env/load';
import { envSpec } from '#config/spec';

type EnvKey = keyof typeof envSpec & string;
type EnvValues = Partial<Record<EnvKey, string | boolean>>;

function loadTestEnv(values: EnvValues, options?: Parameters<typeof loadEnv>[1]) {
  return loadEnv((key) => values[key], options);
}

describe('config env loading', () => {
  it('reads DATA_DIR from env inputs', () => {
    const loaded = loadTestEnv({
      NODE_ENV: 'test',
      DATA_DIR: '/repo/data',
    });

    expect(loaded.server.DATA_DIR).toBe('/repo/data');
  });

  it('requires NODE_ENV', () => {
    expect(() => loadTestEnv({})).toThrow(
      'NODE_ENV is required; run via tools/env.sh.',
    );
  });

  it('derives AUTH_URL from HOST and PORT outside production', () => {
    const loaded = loadTestEnv({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: '4000',
    });

    expect(loaded.server.AUTH_URL).toBe('http://127.0.0.1:4000');
  });

  it('prefers the local URL outside production when APP_PUBLIC_URL is set', () => {
    const loaded = loadTestEnv({
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: '4000',
      APP_PUBLIC_URL: 'https://remdo.example.com',
    });

    expect(loaded.server.AUTH_URL).toBe('http://127.0.0.1:4000');
  });

  it('uses a browser-reachable auth URL when local services bind all interfaces', () => {
    const loaded = loadTestEnv({
      NODE_ENV: 'development',
      HOST: '0.0.0.0',
      PORT: '4000',
    });

    expect(loaded.server.AUTH_URL).toBe('http://127.0.0.1:4000');
  });

  it('reads ALLOW_SIGNUP without accepting the old auth-prefixed key', () => {
    const loaded = loadTestEnv({
      NODE_ENV: 'test',
      ALLOW_SIGNUP: 'true',
    });

    expect(loaded.server.ALLOW_SIGNUP).toBe(true);
    expect(envSpec).not.toHaveProperty('AUTH_ALLOW_SIGNUP');
  });

  it('requires a sufficiently long AUTH_SECRET in production server config', () => {
    expect(() => loadTestEnv({
      NODE_ENV: 'production',
      AUTH_SECRET: 'too-short',
    })).toThrow('AUTH_SECRET must be at least 32 characters long in production.');
  });

  it('derives AUTH_URL from APP_PUBLIC_URL in production server config', () => {
    const loaded = loadTestEnv({
      NODE_ENV: 'production',
      AUTH_SECRET: 'production-auth-secret-0123456789',
      APP_PUBLIC_URL: 'https://remdo.example.com',
    });

    expect(loaded.server.AUTH_URL).toBe('https://remdo.example.com');
  });

  it('skips server-only auth validation for browser config loading', () => {
    const loaded = loadTestEnv({
      NODE_ENV: 'production',
      AUTH_SECRET: 'too-short',
    }, { server: false });

    expect(loaded.runtime.mode).toBe('production');
  });

  it('keeps server-only collaboration env out of client config', () => {
    const loaded = loadTestEnv({
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: '4000',
      REMDO_API_PORT: '4011',
      YSWEET_CONNECTION_STRING: 'ys://127.0.0.1:4004',
      AUTH_SECRET: 'test-auth-secret-0123456789',
      ADMIN_SECRET: 'test-admin-secret-0123456789',
      APP_PUBLIC_URL: 'https://remdo.example.com',
      ALLOW_SIGNUP: 'true',
    });

    expect(loaded.server.REMDO_API_PORT).toBe(4011);
    expect(loaded.server.YSWEET_CONNECTION_STRING).toBe('ys://127.0.0.1:4004');
    expect(loaded.server.AUTH_SECRET).toBe('test-auth-secret-0123456789');
    expect(loaded.server.ADMIN_SECRET).toBe('test-admin-secret-0123456789');
    expect(loaded.server.AUTH_URL).toBe('http://127.0.0.1:4000');
    expect(loaded.server.ALLOW_SIGNUP).toBe(true);
    expect(loaded.client).not.toHaveProperty('REMDO_API_PORT');
    expect(loaded.client).not.toHaveProperty('YSWEET_CONNECTION_STRING');
    expect(loaded.client).not.toHaveProperty('AUTH_SECRET');
    expect(loaded.client).not.toHaveProperty('ADMIN_SECRET');
    expect(loaded.client).not.toHaveProperty('AUTH_URL');
    expect(loaded.client).not.toHaveProperty('APP_PUBLIC_URL');
    expect(loaded.client).not.toHaveProperty('ALLOW_SIGNUP');
  });
});
