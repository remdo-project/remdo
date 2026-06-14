/* eslint-disable node/no-process-env */
import { execFileSync, spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function runEntryPointEnv(command: string, overrides: NodeJS.ProcessEnv): ReturnType<typeof spawnSync> {
  return spawnSync(
    'sh',
    [
      '-c',
      [
        '. ./docker/entrypoint-env.sh',
        command,
      ].join('; '),
    ],
    {
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        ...overrides,
      },
    }
  );
}

function readCaddyEnv(overrides: NodeJS.ProcessEnv): {
  canonicalHost: string;
  siteAddresses: string;
  tlsDirective: string;
} {
  const output = execFileSync(
    'sh',
    [
      '-c',
      [
        '. ./docker/entrypoint-env.sh',
        'remdo_configure_caddy_env',
        String.raw`printf "%s\n%s\n%s" "$CADDY_SITE_ADDRESSES" "$CADDY_TLS_DIRECTIVE" "$CADDY_CANONICAL_HOST"`,
      ].join('; '),
    ],
    {
      env: {
        PATH: process.env.PATH,
        ...overrides,
      },
      encoding: 'utf8',
    }
  );
  const [siteAddresses = '', tlsDirective = '', canonicalHost = ''] = output.split('\n');
  return { canonicalHost, siteAddresses, tlsDirective };
}

describe('docker entrypoint Caddy environment', () => {
  it('binds hosted HTTPS deployments to the platform HTTP port', () => {
    expect(readCaddyEnv({
      APP_PUBLIC_URL: 'https://remdo.onrender.com',
      PORT: '8080',
    })).toEqual({
      canonicalHost: 'remdo.onrender.com',
      siteAddresses: ':8080',
      tlsDirective: '',
    });
  });

  it('keeps self-hosted HTTPS on the canonical public address', () => {
    expect(readCaddyEnv({
      APP_PUBLIC_URL: 'https://remdo.example.test:4443',
      PORT: '4443',
    })).toEqual({
      canonicalHost: 'remdo.example.test',
      siteAddresses: 'https://remdo.example.test:4443',
      tlsDirective: 'tls internal',
    });
  });

  it('honors explicit Caddy site addresses without enabling implicit TLS', () => {
    expect(readCaddyEnv({
      APP_PUBLIC_URL: 'https://remdo.example.test',
      CADDY_SITE_ADDRESSES: ':8080',
      PORT: '8080',
    })).toEqual({
      canonicalHost: 'remdo.example.test',
      siteAddresses: ':8080',
      tlsDirective: '',
    });
  });
});

describe('docker entrypoint API secret validation', () => {
  it('requires AUTH_SECRET', () => {
    const result = runEntryPointEnv('remdo_require_api_secrets', {
      ADMIN_SECRET: 'production-admin-secret-0123456789',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('AUTH_SECRET');
    expect(result.stderr).toContain('Set AUTH_SECRET');
  });

  it('requires ADMIN_SECRET', () => {
    const result = runEntryPointEnv('remdo_require_api_secrets', {
      AUTH_SECRET: 'production-auth-secret-0123456789',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('ADMIN_SECRET');
    expect(result.stderr).toContain('Set ADMIN_SECRET');
  });
});
