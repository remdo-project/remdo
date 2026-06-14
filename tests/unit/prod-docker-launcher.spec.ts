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
        RUN_MODE_PORT_SHIFT: '',
        ...overrides,
      },
    });

    const dockerCalls = result.status === 0 ? fs.readFileSync(dockerLog, 'utf8') : '';
    return { result, dockerCalls };
  }

  it('launches when only a Caddy-internal derived port lands on a Chromium-blocked port', () => {
    // The launcher's +40 shift derives PREVIEW_PORT=4045 (PORT_BASE 4000), which
    // is on Chromium's blocked-port list. Inside the prod container every derived
    // service is reached through Caddy, so only the public PORT (8080) is
    // browser-facing; a blocked derived port must not abort the prod launch.
    const { result, dockerCalls } = runLauncher({
      PORT_BASE: '4000',
      APP_PUBLIC_URL: 'https://remdo-test:8080',
    });

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain('blocked by Chromium');
    expect(result.stdout).toContain('Docker target: https://remdo-test:8080');

    expect(dockerCalls).toContain('build ');
    expect(dockerCalls).toContain('info --format {{json .SecurityOptions}}');
    expect(dockerCalls).toContain('run ');
    expect(dockerCalls).toContain('-e PORT_BASE=4000');
    expect(dockerCalls).toContain('-e PORT=8080');
    expect(dockerCalls).toContain('-p 8080:8080');
  });

  it('aborts when the browser-facing PORT is a Chromium-blocked port', () => {
    // 6666 is on Chromium's blocked list; serving the public site there would
    // give real users ERR_UNSAFE_PORT, so the launcher must refuse to start.
    const { result } = runLauncher({
      PORT_BASE: '4000',
      APP_PUBLIC_URL: 'https://remdo-test:6666',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Port 6666 is blocked by Chromium');
  });

  it('derives the public port and target from APP_PUBLIC_URL', () => {
    const { result, dockerCalls } = runLauncher({
      PORT_BASE: '4000',
      APP_PUBLIC_URL: 'https://remdo-test.example:443',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Docker target: https://remdo-test.example:443');
    expect(dockerCalls).toContain('-e PORT=443');
    expect(dockerCalls).toContain('-p 443:443');
  });

  it('validates the APP_PUBLIC_URL port instead of a provisional shifted PORT', () => {
    // PORT_BASE 4005 would derive provisional PORT=4045 with the prod +40 shift,
    // but explicit APP_PUBLIC_URL owns the browser-facing port.
    const { result, dockerCalls } = runLauncher({
      PORT_BASE: '4005',
      APP_PUBLIC_URL: 'https://remdo-test:8080',
    });

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain('Port 4045 is blocked by Chromium');
    expect(result.stdout).toContain('Docker target: https://remdo-test:8080');
    expect(dockerCalls).toContain('-e PORT_BASE=4005');
    expect(dockerCalls).toContain('-e PORT=8080');
    expect(dockerCalls).toContain('-p 8080:8080');
  });

  it('preserves an APP_PUBLIC_URL port that matches PORT_BASE', () => {
    const { result, dockerCalls } = runLauncher({
      PORT_BASE: '4000',
      APP_PUBLIC_URL: 'https://remdo-test:4000',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Docker target: https://remdo-test:4000');
    expect(dockerCalls).toContain('-e PORT_BASE=4000');
    expect(dockerCalls).toContain('-e PORT=4000');
    expect(dockerCalls).toContain('-p 4000:4000');
  });
});
