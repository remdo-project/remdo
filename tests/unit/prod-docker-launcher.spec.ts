/* eslint-disable node/no-process-env */
import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

function writeFakeDocker(binDir: string): void {
  const dockerPath = path.join(binDir, 'docker');
  fs.writeFileSync(dockerPath, `#!/usr/bin/env sh
set -eu
printf '%s\\n' "$*" >> "\${REMDO_FAKE_DOCKER_LOG:?}"
case "$1" in
  build)
    exit 0
    ;;
  info)
    printf '%s\\n' '["name=rootless"]'
    exit 0
    ;;
  run)
    exit 0
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
  dataDir: string;
  result: SpawnSyncReturns<string>;
  dockerCalls: string;
}

describe('prod Docker launcher', () => {
  let tempDirs: string[] = [];

  beforeEach(() => {
    tempDirs = [];
  });

  afterEach(() => {
    for (const tempDir of tempDirs) {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  function runLauncher(overrides: Record<string, string>): LauncherRun {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-prod-docker-launcher-'));
    tempDirs.push(tempDir);
    const binDir = path.join(tempDir, 'bin');
    const dataDir = path.join(tempDir, 'data');
    const dockerLog = path.join(tempDir, 'docker.log');
    fs.mkdirSync(binDir);
    writeFakeDocker(binDir);

    const result = spawnSync('./tools/prod/docker.sh', {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        ADMIN_SECRET: 'production-admin-secret-0123456789',
        AUTH_SECRET: 'production-auth-secret-0123456789',
        DATA_DIR: dataDir,
        HOSTNAME: 'remdo-test',
        PATH: `${binDir}:${process.env.PATH}`,
        REMDO_FAKE_DOCKER_LOG: dockerLog,
        YSWEET_AUTH_KEY: 'production-ysweet-auth-key',
        YSWEET_SERVER_TOKEN: 'production-ysweet-server-token',
        // Neutralize every port-related input so the run is hermetic against
        // the developer's shell and the repo .env (empty string counts as set).
        APP_PUBLIC_URL: '',
        AUTH_URL: '',
        PORT: '',
        PORT_BASE: '',
        ...overrides,
      },
    });

    const dockerCalls = result.status === 0 ? fs.readFileSync(dockerLog, 'utf8') : '';
    return { dataDir, result, dockerCalls };
  }

  it('defaults the listen PORT to 8080 and derives the target from it', () => {
    // No PORT and no APP_PUBLIC_URL: PORT is an independent prod input that
    // defaults to 8080, and the launcher derives APP_PUBLIC_URL = https://<host>:<PORT>.
    const { dataDir, result, dockerCalls } = runLauncher({
      PORT_BASE: '4000',
    });

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain('blocked by Chromium');
    expect(result.stdout).toContain('Docker target: https://remdo-test.shared:8080');

    expect(dockerCalls).toContain('build ');
    expect(dockerCalls).toContain('info --format {{json .SecurityOptions}}');
    expect(dockerCalls).toContain('run ');
    expect(dockerCalls).toContain('-e PORT_BASE=4000');
    expect(dockerCalls).toContain('-e PORT=8080');
    expect(dockerCalls).toContain('-p 8080:8080');
    expect(dockerCalls).toContain(`-v ${dataDir}:/data`);
  });

  it('honors an explicit PORT and derives the target from it', () => {
    const { result, dockerCalls } = runLauncher({
      PORT_BASE: '4000',
      PORT: '9090',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Docker target: https://remdo-test.shared:9090');
    expect(dockerCalls).toContain('-e PORT=9090');
    expect(dockerCalls).toContain('-p 9090:9090');
  });

  it('does not derive PORT from APP_PUBLIC_URL', () => {
    // APP_PUBLIC_URL is the public identity only; its :443 must not change the
    // browser-facing bind PORT, which stays at the independent default 8080.
    const { result, dockerCalls } = runLauncher({
      PORT_BASE: '4000',
      APP_PUBLIC_URL: 'https://remdo-test.example:443',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Docker target: https://remdo-test.example:443');
    expect(dockerCalls).toContain('-e APP_PUBLIC_URL=https://remdo-test.example:443');
    expect(dockerCalls).toContain('-e PORT=8080');
    expect(dockerCalls).toContain('-p 8080:8080');
  });

  it('uses an explicit APP_PUBLIC_URL as-is while PORT stays independent', () => {
    const { result, dockerCalls } = runLauncher({
      PORT_BASE: '4000',
      PORT: '8080',
      APP_PUBLIC_URL: 'https://remdo.example.com',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Docker target: https://remdo.example.com');
    expect(dockerCalls).toContain('-e APP_PUBLIC_URL=https://remdo.example.com');
    expect(dockerCalls).toContain('-e PORT=8080');
    expect(dockerCalls).toContain('-p 8080:8080');
  });

  it('warns (without failing) when APP_PUBLIC_URL advertises a port != the bind PORT', () => {
    const { result } = runLauncher({
      PORT_BASE: '4000',
      PORT: '8080',
      APP_PUBLIC_URL: 'https://remdo.example.com:8443',
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('APP_PUBLIC_URL port (8443) differs from the published PORT (8080)');
  });

  it('does not warn for a default-port (proxy-fronted) APP_PUBLIC_URL', () => {
    const { result } = runLauncher({
      PORT_BASE: '4000',
      PORT: '8080',
      APP_PUBLIC_URL: 'https://remdo.example.com',
    });

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain('differs from the published PORT');
  });

  it('forwards AUTH_SECRET and the Y-Sweet pair to the container when set', () => {
    // runLauncher passes all three secrets by default; assert they reach docker.
    const { result, dockerCalls } = runLauncher({
      PORT_BASE: '4000',
    });

    expect(result.status).toBe(0);
    expect(dockerCalls).toContain('-e ADMIN_SECRET=production-admin-secret-0123456789');
    expect(dockerCalls).toContain('-e AUTH_SECRET=production-auth-secret-0123456789');
    expect(dockerCalls).toContain('-e YSWEET_AUTH_KEY=production-ysweet-auth-key');
    expect(dockerCalls).toContain('-e YSWEET_SERVER_TOKEN=production-ysweet-server-token');
  });

  it('omits the bootstrap-managed secrets when unset, so the in-container bootstrap runs', () => {
    // Empty values count as unset; only ADMIN_SECRET (required) is forwarded, the
    // rest are left for the container to bootstrap from its persistent DATA_DIR.
    const { result, dockerCalls } = runLauncher({
      PORT_BASE: '4000',
      AUTH_SECRET: '',
      YSWEET_AUTH_KEY: '',
      YSWEET_SERVER_TOKEN: '',
    });

    expect(result.status).toBe(0);
    expect(dockerCalls).toContain('-e ADMIN_SECRET=production-admin-secret-0123456789');
    expect(dockerCalls).not.toContain('-e AUTH_SECRET=');
    expect(dockerCalls).not.toContain('-e YSWEET_AUTH_KEY=');
    expect(dockerCalls).not.toContain('-e YSWEET_SERVER_TOKEN=');
  });

  it('aborts when the browser-facing PORT is a Chromium-blocked port', () => {
    // 6666 is on Chromium's blocked list; serving the public site there would
    // give real users ERR_UNSAFE_PORT, so the launcher must refuse to start.
    const { result } = runLauncher({
      PORT_BASE: '4000',
      PORT: '6666',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Port 6666 is blocked by Chromium');
  });
});
