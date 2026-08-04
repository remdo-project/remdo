/* eslint-disable node/no-process-env */
import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertAuthorizationServerOrigin,
  assertPublicSourceConfig,
} from '../../tools/dev/linking-preflight-lib';
import {
  waitForDevelopmentCollaboration,
} from '../../tools/dev/seed-after-ready-lib';

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

  function runDockerLauncher(
    args: string[],
    overrides: Record<string, string> = {},
  ): LauncherRun {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-dev-runtime-'));
    tempDirs.push(tempDir);
    const binDir = path.join(tempDir, 'bin');
    const dockerLog = path.join(tempDir, 'docker.log');
    fs.mkdirSync(binDir);
    writeFakeDocker(binDir);

    const result = spawnSync('./tools/dev/docker.sh', args, {
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

  it('publishes the bridge-mode Docker gateway on loopback by default', () => {
    const { result, dockerCalls } = runDockerLauncher([]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Starting private Docker app: http://localhost:4640');
    expect(dockerCalls).toContain('-p 127.0.0.1:4640:4640');
    expect(dockerCalls).toContain('-e CADDY_SITE_ADDRESSES=http://:4640');
    expect(dockerCalls).toContain('-e CADDY_BIND_DIRECTIVE=bind 0.0.0.0');
    expect(dockerCalls).toContain('-e PORT_BASE=4640');
  });

  it('publishes only the gateway on all interfaces for a headless VM', () => {
    const { result, dockerCalls } = runDockerLauncher([], {
      HOST: '0.0.0.0',
      PUBLIC_HOST: 'dev-vm',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Starting private Docker app: http://dev-vm:4640');
    expect(dockerCalls).toContain('-p 0.0.0.0:4640:4640');
    expect(dockerCalls).not.toContain('-p 0.0.0.0:4644:4644');
    expect(dockerCalls).not.toContain('-p 0.0.0.0:4651:4651');
  });

  it('preserves a concrete Docker gateway bind address', () => {
    const bridge = runDockerLauncher([], {
      HOST: '192.0.2.10',
      PUBLIC_HOST: 'dev-vm',
    });
    const host = runDockerLauncher(['--network=host'], {
      HOST: '192.0.2.10',
      PUBLIC_HOST: 'dev-vm',
    });

    expect(bridge.result.status).toBe(0);
    expect(bridge.dockerCalls).toContain('-p 192.0.2.10:4640:4640');
    expect(host.result.status).toBe(0);
    expect(host.dockerCalls).toContain('-e CADDY_BIND_DIRECTIVE=bind 192.0.2.10');
  });

  it('preserves an IPv6-loopback Docker gateway', () => {
    const bridge = runDockerLauncher([], {
      HOST: '::1',
      PUBLIC_HOST: '::1',
    });
    const host = runDockerLauncher(['--network=host'], {
      HOST: '::1',
      PUBLIC_HOST: '::1',
    });

    expect(bridge.result.status).toBe(0);
    expect(bridge.result.stdout).toContain('Starting private Docker app: http://[::1]:4640');
    expect(bridge.dockerCalls).toContain('-p [::1]:4640:4640');
    expect(host.result.status).toBe(0);
    expect(host.dockerCalls).toContain('--network=host');
    expect(host.dockerCalls).toContain('-e CADDY_BIND_DIRECTIVE=bind ::1');
  });

  it('uses host networking without port publication for source linking', () => {
    const { result, dockerCalls } = runDockerLauncher(['--network=host']);

    expect(result.status).toBe(0);
    expect(dockerCalls).toContain('version --format {{.Server.Version}}');
    expect(dockerCalls).toContain('--network=host');
    expect(dockerCalls).not.toContain('-p 127.0.0.1:4640:4640');
    expect(dockerCalls).toContain('-e CADDY_SITE_ADDRESSES=http://:4640');
    expect(dockerCalls).toContain('-e CADDY_BIND_DIRECTIVE=bind 127.0.0.1');
  });

  it('rejects rootless host networking before Docker Engine 29.5', () => {
    const { result } = runDockerLauncher(['--network=host'], {
      REMDO_FAKE_DOCKER_VERSION: '29.4.0',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('requires Docker Engine 29.5 or newer');
  });

  it('isolates the PWA stack data and shifts its complete port range', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-pwa-runtime-'));
    tempDirs.push(tempDir);
    const binDir = path.join(tempDir, 'bin');
    const callLog = path.join(tempDir, 'calls.log');
    fs.mkdirSync(binDir);
    for (const command of ['pnpm', 'concurrently']) {
      const commandPath = path.join(binDir, command);
      fs.writeFileSync(commandPath, `#!/usr/bin/env sh
set -eu
printf '%s|%s|%s|%s\\n' "\${DATA_DIR}" "\${PORT_BASE}" "\${PORT}" "$*" >> "\${REMDO_FAKE_CALL_LOG:?}"
`);
      fs.chmodSync(commandPath, 0o755);
    }

    const result = spawnSync('./tools/dev/pwa.sh', {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        DATA_DIR: path.join(tempDir, 'data'),
        HOST: 'localhost',
        NODE_ENV: 'development',
        PATH: `${binDir}:${process.env.PATH}`,
        PORT_BASE: '4600',
        PUBLIC_HOST: 'localhost',
        REMDO_FAKE_CALL_LOG: callLog,
      },
    });

    expect(result.status).toBe(0);
    expect(fs.readFileSync(callLog, 'utf8')).toContain(
      `${path.join(tempDir, 'data', 'pwa-preview')}|4620|4620|run build`,
    );
  });
});

describe('development startup readiness', () => {
  it('waits until the collaboration service is ready', async () => {
    const collabStates = [false, false, true];

    await waitForDevelopmentCollaboration({
      attempts: 3,
      collabReady: async () => collabStates.shift() ?? true,
      pollIntervalMs: 0,
      port: 4004,
    });

    expect(collabStates).toEqual([]);
  });

  it('fails startup when collaboration never becomes ready', async () => {
    await expect(waitForDevelopmentCollaboration({
      attempts: 1,
      collabReady: async () => false,
      pollIntervalMs: 0,
      port: 4004,
    })).rejects.toThrow('Development collaboration service did not become ready on port 4004');
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
