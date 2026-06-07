/* eslint-disable node/no-process-env */
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { loadEnv } from '#config/_internal/env/load';
import { envSpec } from '#config/spec';

type EnvKey = keyof typeof envSpec & string;
type EnvValues = Partial<Record<EnvKey, string | boolean>>;

function loadTestEnv(values: EnvValues, options?: Parameters<typeof loadEnv>[1]) {
  return loadEnv((key) => values[key], options);
}

function readEnvShValue(name: string, overrides: NodeJS.ProcessEnv): string {
  const env = { ...process.env, ...overrides };
  delete env.AUTH_URL;
  delete env.LINKABLE_REMDO_SERVERS_JSON;
  delete env.REMDO_DEV_HOME_ORIGIN;
  if (!('PORT' in overrides)) {
    delete env.PORT;
  }

  return execFileSync('./tools/env.sh', ['sh', '-c', `printf '%s' "$${name}"`], {
    env,
    encoding: 'utf8',
  });
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
      DEV_DOCUMENT_ID: 'testDevDoc',
      HOST: '127.0.0.1',
      PORT: '4000',
      APP_PUBLIC_URL: 'https://remdo.example.com',
    });

    expect(loaded.server.AUTH_URL).toBe('http://127.0.0.1:4000');
  });

  it('uses explicit AUTH_URL when provided', () => {
    const loaded = loadTestEnv({
      NODE_ENV: 'development',
      AUTH_URL: 'https://remdo.example.test',
      HOST: '0.0.0.0',
      PORT: '4000',
    });

    expect(loaded.server.AUTH_URL).toBe('https://remdo.example.test');
  });

  it('uses a browser-reachable localhost auth URL when local services bind all interfaces', () => {
    const loaded = loadTestEnv({
      NODE_ENV: 'development',
      HOST: '0.0.0.0',
      PORT: '4000',
    });

    expect(loaded.server.AUTH_URL).toBe('http://localhost:4000');
  });

  it('defaults dev AUTH_URL to the explicit PORT from the shell env', () => {
    const authUrl = readEnvShValue('AUTH_URL', {
      NODE_ENV: 'development',
      PORT_BASE: '4000',
      PORT: '4500',
      RUN_MODE_PORT_SHIFT: '0',
    });

    expect(authUrl).toBe('http://localhost:4500');
  });

  it('keeps dev AUTH_URL source-local when a Docker home origin is provided', () => {
    const authUrl = readEnvShValue('AUTH_URL', {
      NODE_ENV: 'development',
      PORT_BASE: '4000',
      REMDO_DEV_HOME_ORIGIN: 'https://localhost:4040',
      RUN_MODE_PORT_SHIFT: '0',
    });

    expect(authUrl).toBe('http://localhost:4000');
  });

  it('does not configure linkable RemDo servers for normal dev by default', () => {
    const linkableServers = readEnvShValue('LINKABLE_REMDO_SERVERS_JSON', {
      NODE_ENV: 'development',
      PORT_BASE: '4000',
      RUN_MODE_PORT_SHIFT: '0',
    });

    expect(linkableServers).toBe('');
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

  it('requires production server secrets and canonical public URL', () => {
    expect(() => loadTestEnv({
      NODE_ENV: 'production',
      AUTH_SECRET: 'production-auth-secret-0123456789',
    })).toThrow('APP_PUBLIC_URL is required in production server config.');

    expect(() => loadTestEnv({
      NODE_ENV: 'production',
      APP_PUBLIC_URL: ':8080',
      AUTH_SECRET: 'production-auth-secret-0123456789',
      ADMIN_SECRET: 'production-admin-secret-0123456789',
      YSWEET_SERVER_TOKEN: 'production-ysweet-server-token',
    })).toThrow('APP_PUBLIC_URL must be an absolute http(s) URL in production server config.');
  });

  it('allows production utility config without app auth secrets', () => {
    const loaded = loadTestEnv({
      NODE_ENV: 'production',
    });

    expect(loaded.runtime.mode).toBe('production');
    expect(loaded.server.AUTH_URL).toBe('');
  });

  it('derives AUTH_URL from APP_PUBLIC_URL in production server config', () => {
    const loaded = loadTestEnv({
      NODE_ENV: 'production',
      AUTH_SECRET: 'production-auth-secret-0123456789',
      ADMIN_SECRET: 'production-admin-secret-0123456789',
      APP_PUBLIC_URL: 'https://remdo.example.com',
      YSWEET_SERVER_TOKEN: 'production-ysweet-server-token',
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
      DEV_DOCUMENT_ID: 'testDevDoc',
      HOST: '127.0.0.1',
      PORT: '4000',
      API_SERVER_PORT: '4011',
      YSWEET_CONNECTION_STRING: 'ys://127.0.0.1:4004',
      YSWEET_AUTH_KEY: 'test-ysweet-auth-key',
      YSWEET_SERVER_TOKEN: 'test-ysweet-server-token',
      AUTH_SECRET: 'test-auth-secret-0123456789',
      ADMIN_SECRET: 'test-admin-secret-0123456789',
      APP_PUBLIC_URL: 'https://remdo.example.com',
      ALLOW_SIGNUP: 'true',
    });

    expect(loaded.server.DEV_DOCUMENT_ID).toBe('testDevDoc');
    expect(loaded.client.DEV_DOCUMENT_ID).toBe('testDevDoc');
    expect(loaded.server.API_SERVER_PORT).toBe(4011);
    expect(loaded.server.YSWEET_CONNECTION_STRING).toBe('ys://127.0.0.1:4004');
    expect(loaded.server.YSWEET_AUTH_KEY).toBe('test-ysweet-auth-key');
    expect(loaded.server.YSWEET_SERVER_TOKEN).toBe('test-ysweet-server-token');
    expect(loaded.server.AUTH_SECRET).toBe('test-auth-secret-0123456789');
    expect(loaded.server.ADMIN_SECRET).toBe('test-admin-secret-0123456789');
    expect(loaded.server.AUTH_URL).toBe('http://127.0.0.1:4000');
    expect(loaded.server.ALLOW_SIGNUP).toBe(true);
    expect(loaded.client).not.toHaveProperty('API_SERVER_PORT');
    expect(loaded.client).not.toHaveProperty('YSWEET_CONNECTION_STRING');
    expect(loaded.client).not.toHaveProperty('YSWEET_AUTH_KEY');
    expect(loaded.client).not.toHaveProperty('YSWEET_SERVER_TOKEN');
    expect(loaded.client).not.toHaveProperty('AUTH_SECRET');
    expect(loaded.client).not.toHaveProperty('ADMIN_SECRET');
    expect(loaded.client).not.toHaveProperty('AUTH_URL');
    expect(loaded.client).not.toHaveProperty('APP_PUBLIC_URL');
    expect(loaded.client).not.toHaveProperty('ALLOW_SIGNUP');
  });
});
