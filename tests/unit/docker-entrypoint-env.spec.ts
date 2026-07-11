/* eslint-disable node/no-process-env */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
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

describe('docker entrypoint HOST default', () => {
  // The entrypoint pins HOST to the IPv4 loopback so the API server does not
  // bind IPv6-only (`localhost` can resolve to ::1), which would leave Caddy's
  // 127.0.0.1 upstreams unreachable. This is order-sensitive: env.defaults.sh
  // also defaults HOST (to `localhost`), so the entrypoint must set it *before*
  // sourcing those defaults. Run the real entrypoint up to and including the
  // defaults source, then read HOST — this catches the ordering, which an
  // isolated eval of the pin line would miss.
  function resolveHost(overrides: NodeJS.ProcessEnv): string {
    const output = execFileSync(
      'sh',
      [
        '-c',
        [
          // Replay the entrypoint prologue: REMDO_ROOT default + the HOST pin,
          // then source env.defaults.sh exactly as the entrypoint does. Slicing
          // the file up to the defaults source keeps the test bound to the real
          // ordering instead of a copied snippet.
          'export REMDO_ROOT="$PWD"',
          String.raw`eval "$(sed -n '/^: "\${HOST:=/,/^\. .*env\.defaults\.sh/p' docker/entrypoint.sh | sed 's#/usr/local/share/remdo/env.defaults.sh#tools/env.defaults.sh#')"`,
          'printf "%s" "$HOST"',
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
    return output;
  }

  it('defaults HOST to the IPv4 loopback even after sourcing env.defaults.sh', () => {
    expect(resolveHost({})).toBe('127.0.0.1');
  });

  it('honors an explicit HOST override', () => {
    expect(resolveHost({ HOST: '0.0.0.0' })).toBe('0.0.0.0');
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

describe('docker entrypoint production diagnostics', () => {
  it('limits Y-Sweet output to errors', () => {
    const entrypoint = fs.readFileSync('docker/entrypoint.sh', 'utf8');

    expect(entrypoint).toMatch(/RUST_LOG=error Y_SWEET_AUTH=.*y-sweet serve/su);
  });
});
