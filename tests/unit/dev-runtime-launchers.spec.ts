/* eslint-disable node/no-process-env */
import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertAuthorizationServerOrigin,
  assertPublicSourceConfig,
} from '../../tools/dev/linking-preflight-lib';
import { waitForPortOpen } from '../../tools/lib/net';

function writeFakeDocker(binDir: string): void {
  const dockerPath = path.join(binDir, 'docker');
  fs.writeFileSync(dockerPath, `#!/usr/bin/env sh
set -eu
printf '%s\\n' "$*" >> "\${REMDO_FAKE_DOCKER_LOG:?}"
case "$1" in
  info)
    printf '%s\\n' '["name=rootless"]'
    ;;
  version)
    printf '%s\\n' "\${REMDO_FAKE_DOCKER_VERSION:-29.7.0}"
    ;;
  build|run|rm)
    ;;
  *)
    echo "unexpected docker command: $1" >&2
    exit 1
    ;;
esac
`);
  fs.chmodSync(dockerPath, 0o755);
}

interface LauncherRun {
  result: SpawnSyncReturns<string>;
  dockerCalls: string;
}

describe('development runtime launchers', () => {
  let tempDirs: string[] = [];

  beforeEach(() => {
    tempDirs = [];
  });

  afterEach(() => {
    for (const tempDir of tempDirs) {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  function runDockerLauncher(overrides: Record<string, string> = {}): LauncherRun {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-dev-runtime-'));
    tempDirs.push(tempDir);
    const binDir = path.join(tempDir, 'bin');
    const dockerLog = path.join(tempDir, 'docker.log');
    fs.mkdirSync(binDir);
    writeFakeDocker(binDir);

    const result = spawnSync('pnpm', ['run', 'dev:docker'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'development',
        APP_PUBLIC_URL: '',
        DATA_DIR: path.join(tempDir, 'data'),
        HOST: 'localhost',
        PUBLIC_HOST: 'localhost',
        PORT_BASE: '4600',
        PATH: `${binDir}:${process.env.PATH}`,
        REMDO_FAKE_DOCKER_LOG: dockerLog,
        ...overrides,
      },
    });

    const dockerCalls = fs.existsSync(dockerLog) ? fs.readFileSync(dockerLog, 'utf8') : '';
    return { result, dockerCalls };
  }

  it('runs the local Docker app on the host network', () => {
    const { result, dockerCalls } = runDockerLauncher();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Starting private Docker app: http://localhost:4640');
    expect(dockerCalls).toContain('version --format {{.Server.Version}}');
    expect(dockerCalls).toContain('--network=host');
    expect(dockerCalls).not.toContain('-p 127.0.0.1:4640:4640');
    expect(dockerCalls).toContain('-e CADDY_SITE_ADDRESSES=http://:4640');
    expect(dockerCalls).toContain('-e CADDY_BIND_DIRECTIVE=bind 127.0.0.1');
    expect(dockerCalls).toContain('-e PORT_BASE=4640');
  });

  it('binds the Docker gateway on all interfaces for a headless VM', () => {
    const { result, dockerCalls } = runDockerLauncher({
      HOST: '0.0.0.0',
      PUBLIC_HOST: 'dev-vm',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Starting private Docker app: http://dev-vm:4640');
    expect(dockerCalls).toContain('--network=host');
    expect(dockerCalls).toContain('-e CADDY_BIND_DIRECTIVE=bind 0.0.0.0');
  });

  it.each([
    {
      label: 'concrete IPv4 address',
      env: { HOST: '192.0.2.10', PUBLIC_HOST: 'dev-vm' },
      origin: 'http://dev-vm:4640',
      bind: '-e CADDY_BIND_DIRECTIVE=bind 192.0.2.10',
    },
    {
      label: 'IPv6 loopback',
      env: { HOST: '::1', PUBLIC_HOST: '::1' },
      origin: 'http://[::1]:4640',
      bind: '-e CADDY_BIND_DIRECTIVE=bind ::1',
    },
  ])('preserves a $label Docker gateway bind address', ({ env, origin, bind }) => {
    const { result, dockerCalls } = runDockerLauncher(env);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`Starting private Docker app: ${origin}`);
    expect(dockerCalls).toContain('--network=host');
    expect(dockerCalls).toContain(bind);
  });

  it('rejects rootless host networking before Docker Engine 29.5', () => {
    const { result } = runDockerLauncher({
      REMDO_FAKE_DOCKER_VERSION: '29.4.0',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('requires Docker Engine 29.5 or newer');
  });

  function runPwaLauncher({ curlStatus = 0 }: { curlStatus?: number } = {}) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-pwa-runtime-'));
    tempDirs.push(tempDir);
    const binDir = path.join(tempDir, 'bin');
    const callLog = path.join(tempDir, 'calls.log');
    fs.mkdirSync(binDir);
    const pnpmPath = path.join(binDir, 'pnpm');
    fs.writeFileSync(pnpmPath, `#!/usr/bin/env sh
set -eu
printf '%s|%s|%s|%s\\n' "\${DATA_DIR}" "\${PORT_BASE}" "\${PORT}" "$*" >> "\${REMDO_FAKE_CALL_LOG:?}"
if [ "$*" = "exec tsx ./tools/dev/print-local-gateway-origin.ts" ]; then
  printf 'http://127.0.0.1:%s' "\${PORT}"
fi
`);
    fs.chmodSync(pnpmPath, 0o755);
    const concurrentlyPath = path.join(binDir, 'concurrently');
    fs.writeFileSync(concurrentlyPath, `#!/usr/bin/env sh
set -eu
printf '%s|%s|%s|%s\\n' "\${DATA_DIR}" "\${PORT_BASE}" "\${PORT}" "$*" >> "\${REMDO_FAKE_CALL_LOG:?}"
`);
    fs.chmodSync(concurrentlyPath, 0o755);
    const curlPath = path.join(binDir, 'curl');
    fs.writeFileSync(curlPath, `#!/usr/bin/env sh
set -eu
printf '%s|%s|%s|%s\n' "\${DATA_DIR}" "\${PORT_BASE}" "\${PORT}" "curl $*" >> "\${REMDO_FAKE_CALL_LOG:?}"
exit "\${REMDO_FAKE_CURL_STATUS:-0}"
`);
    fs.chmodSync(curlPath, 0o755);

    const result = spawnSync('./tools/dev/pwa.sh', {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        DATA_DIR: path.join(tempDir, 'data'),
        HOST: '0.0.0.0',
        NODE_ENV: 'development',
        PATH: `${binDir}:${process.env.PATH}`,
        PORT_BASE: '4600',
        PUBLIC_HOST: 'browser-visible.test',
        REMDO_FAKE_CURL_STATUS: String(curlStatus),
        REMDO_FAKE_CALL_LOG: callLog,
      },
    });

    const calls = fs.existsSync(callLog) ? fs.readFileSync(callLog, 'utf8') : '';
    return { calls, result, tempDir };
  }

  it('runs the PWA frontend against the main development gateway', () => {
    const { calls, result, tempDir } = runPwaLauncher();

    expect(result.status).toBe(0);
    expect(calls).toContain(`${path.join(tempDir, 'data')}|4600|4600|curl -fsS http://127.0.0.1:4600/api/health`);
    expect(calls).toContain(`${path.join(tempDir, 'data')}|4600|4600|run build`);
    expect(calls).toContain('pnpm exec vite preview --port 4620');
    expect(calls).not.toContain('dev:api');
    expect(calls).not.toContain('dev:collab');
    expect(calls).not.toContain('dev:data-reset');
    expect(calls).not.toContain('dev:seed');
  });

  it('requires the main development gateway before starting the PWA frontend', () => {
    const { calls, result } = runPwaLauncher({ curlStatus: 1 });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('run pnpm dev first');
    expect(calls).not.toContain('run build');
  });
});

describe('development startup readiness', () => {
  async function listen(server: net.Server, port: number): Promise<number> {
    await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
    return (server.address() as net.AddressInfo).port;
  }

  function close(server: net.Server): Promise<void> {
    return new Promise((resolve) => server.close(() => resolve()));
  }

  it('waits until the port accepts connections', async () => {
    // Reserve an ephemeral port, release it, then reopen it while the wait polls.
    const probe = net.createServer();
    const port = await listen(probe, 0);
    await close(probe);

    const pending = waitForPortOpen('127.0.0.1', port, { attempts: 50, pollIntervalMs: 10 });
    const server = net.createServer();
    await listen(server, port);
    await expect(pending).resolves.toBe(true);
    await close(server);
  });

  it('gives up when the port never opens within the attempt budget', async () => {
    const probe = net.createServer();
    const port = await listen(probe, 0);
    await close(probe);

    await expect(waitForPortOpen('127.0.0.1', port, { attempts: 2, pollIntervalMs: 0 }))
      .resolves.toBe(false);
  });
});

describe('source-linking preflight', () => {
  it('accepts metadata under the configured source origin', () => {
    expect(() => assertAuthorizationServerOrigin({
      authorization_endpoint: 'http://localhost:4000/api/auth/oauth2/authorize',
    }, 'http://localhost:4000')).not.toThrow();
  });

  it('rejects missing or mismatched source metadata', () => {
    expect(() => assertAuthorizationServerOrigin({}, 'http://localhost:4000')).toThrow(
      'does not advertise an authorization endpoint',
    );
    expect(() => assertAuthorizationServerOrigin({
      authorization_endpoint: 'http://localhost:5000/api/auth/oauth2/authorize',
    }, 'http://localhost:4000')).toThrow(
      'advertises http://localhost:5000, but current configuration resolves http://localhost:4000',
    );
  });

  it('rejects a running source whose actual policy is private', () => {
    expect(() => assertPublicSourceConfig({ publicServer: true })).not.toThrow();
    expect(() => assertPublicSourceConfig({ publicServer: false })).toThrow(
      'The running development source is private',
    );
  });
});
