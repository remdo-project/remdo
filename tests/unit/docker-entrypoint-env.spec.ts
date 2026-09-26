/* eslint-disable node/no-process-env */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
  bindAddress: string;
  siteAddress: string;
} {
  const result = runEntryPointEnv(
    String.raw`remdo_configure_caddy_env; printf "%s\n%s" "$CADDY_SITE_ADDRESS" "$REMDO_GATEWAY_BIND_ADDRESS"`,
    overrides,
  );
  expect(result.status).toBe(0);
  const output = String(result.stdout);
  const [siteAddress = '', bindAddress = ''] = output.split('\n');
  return { bindAddress, siteAddress };
}

describe('docker entrypoint Caddy environment', () => {
  it('binds hosted HTTPS deployments to the platform HTTP port', () => {
    expect(readCaddyEnv({
      APP_ORIGIN: 'https://remdo.onrender.com',
      PORT: '8080',
    })).toEqual({
      bindAddress: '',
      siteAddress: 'http://remdo.onrender.com:8080',
    });
  });

  it('keeps self-hosted HTTPS on the canonical public address', () => {
    expect(readCaddyEnv({
      APP_ORIGIN: 'https://remdo.example.test:4443',
    })).toEqual({
      bindAddress: '',
      siteAddress: 'https://remdo.example.test:4443',
    });
  });

  it('ignores raw Caddy overrides outside the development container', () => {
    expect(readCaddyEnv({
      APP_ORIGIN: 'https://remdo.example.test',
      CADDY_BIND_DIRECTIVE: 'bind 0.0.0.0',
      CADDY_SITE_ADDRESS: 'http://:9999',
      REMDO_GATEWAY_BIND_ADDRESS: '127.0.0.1',
    })).toEqual({
      bindAddress: '',
      siteAddress: 'https://remdo.example.test',
    });
  });

  it('retains repository-owned development Caddy wiring', () => {
    expect(readCaddyEnv({
      APP_ORIGIN: 'http://localhost:4640',
      CADDY_SITE_ADDRESS: 'http://:4640',
      REMDO_GATEWAY_BIND_ADDRESS: '127.0.0.1',
      REMDO_DEV_CONTAINER: 'true',
    })).toEqual({
      bindAddress: '127.0.0.1',
      siteAddress: 'http://localhost:4640',
    });
  });

  it('serves an explicit localhost production origin without TLS', () => {
    expect(readCaddyEnv({
      APP_ORIGIN: 'http://remdo-8443.localhost:8443',
      REMDO_LAUNCHER_LOOPBACK_HTTP: 'true',
    })).toEqual({
      bindAddress: '',
      siteAddress: 'http://remdo-8443.localhost:8443',
    });
  });

  it('rejects localhost HTTP when the production launcher did not select it', () => {
    const result = runEntryPointEnv('remdo_configure_caddy_env', {
      APP_ORIGIN: 'http://remdo-8443.localhost:8443',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('requires the self-hosted loopback launcher');
  });

  it('rejects HTTP outside a dedicated localhost subdomain', () => {
    for (const appOrigin of ['http://localhost:8080', 'http://remdo.example.test:8080']) {
      const result = runEntryPointEnv('remdo_configure_caddy_env', {
        APP_ORIGIN: appOrigin,
      });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('APP_ORIGIN must use HTTPS unless');
    }
  });

  it('rejects an invalid development-container origin', () => {
    const result = runEntryPointEnv('remdo_configure_caddy_env', {
      APP_ORIGIN: 'http://localhost:4640/path',
      REMDO_DEV_CONTAINER: 'true',
      REMDO_GATEWAY_BIND_ADDRESS: '127.0.0.1',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('APP_ORIGIN must be an exact HTTP(S) origin');
  });
});

describe('docker entrypoint internal services', () => {
  function resolveInternalServices(overrides: NodeJS.ProcessEnv): string[] {
    return String(runEntryPointEnv(
      String.raw`remdo_configure_internal_services; printf "%s\n%s" "$API_SERVER_PORT" "$COLLAB_SERVER_PORT"`,
      overrides,
    ).stdout).trim().split('\n');
  }

  it('ignores production overrides and uses fixed loopback endpoints', () => {
    expect(resolveInternalServices({
      API_SERVER_PORT: '9011',
      COLLAB_SERVER_PORT: '9004',
      HOST: '0.0.0.0',
    })).toEqual([
      '4011',
      '4004',
    ]);
  });

  it('retains repository-owned development container ports', () => {
    expect(resolveInternalServices({
      API_SERVER_PORT: '4651',
      COLLAB_SERVER_PORT: '4644',
      REMDO_DEV_CONTAINER: 'true',
    })).toEqual([
      '4651',
      '4644',
    ]);
  });
});

describe('docker entrypoint Node heaps', () => {
  function heaps(memoryLimit: string) {
    const result = runEntryPointEnv(
      String.raw`remdo_configure_node_heaps '${memoryLimit}' && printf "%s %s %s" "$collaboration_heap_mb" "$mcp_heap_mb" "$MCP_DOCUMENT_SLOTS"`,
      {},
    );
    return { status: result.status, heaps: String(result.stdout), error: String(result.stderr) };
  }

  it('splits the memory the other services leave between collaboration and MCP document slots', () => {
    expect(heaps(String(512 * 2 ** 20))).toMatchObject({ status: 0, heaps: '192 64 2' });
    expect(heaps(String(2048 * 2 ** 20))).toMatchObject({ status: 0, heaps: '1344 448 26' });
    expect(heaps(String(448 * 2 ** 20))).toMatchObject({ status: 0, heaps: '144 48 1' });
  });

  it('leaves Node defaults without a container memory limit', () => {
    expect(heaps('max')).toMatchObject({ status: 0, heaps: '  ' });
    expect(heaps('')).toMatchObject({ status: 0, heaps: '  ' });
  });

  it('reads the container limit from cgroup v2 or v1', () => {
    const limit = (files: Record<string, string>) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-cgroup-'));
      for (const [name, value] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
        fs.writeFileSync(path.join(root, name), `${value}\n`);
      }
      return String(runEntryPointEnv(`remdo_container_memory_limit '${root}'`, {}).stdout).trim();
    };
    expect(limit({ 'memory.max': '536870912' })).toBe('536870912');
    expect(limit({ 'memory.max': 'max' })).toBe('max');
    expect(limit({ 'memory/memory.limit_in_bytes': '536870912' })).toBe('536870912');
    expect(limit({ 'memory/memory.limit_in_bytes': '9223372036854771712' })).toBe('max');
    expect(limit({})).toBe('');
  });

  it('refuses a memory limit too small for the services', () => {
    expect(heaps(String(384 * 2 ** 20))).toMatchObject({ status: 1, error: 'RemDo needs a memory limit of at least 448 MB.\n' });
  });
});
