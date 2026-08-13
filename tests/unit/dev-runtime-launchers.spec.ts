/* eslint-disable node/no-process-env */
import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeFakeBin } from './_support/fake-bins';

function writeFakeDocker(binDir: string): void {
  writeFakeBin(binDir, 'docker', `printf '%s\\n' "$*" >> "\${REMDO_FAKE_DOCKER_LOG:?}"
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
}

interface LauncherRun {
  dataDir: string;
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
    const dataDir = path.join(tempDir, 'data');
    const dockerLog = path.join(tempDir, 'docker.log');
    fs.mkdirSync(binDir);
    writeFakeDocker(binDir);

    // Invoke the dev:docker script's command directly (see package.json), like
    // the prod launcher spec, to skip a per-case pnpm-run bootstrap.
    const result = spawnSync('./tools/env.sh', ['--port-base-offset', '40', './tools/dev/docker.sh'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'development',
        APP_PUBLIC_URL: '',
        DATA_DIR: dataDir,
        HOST: 'localhost',
        PUBLIC_HOST: 'localhost',
        PORT_BASE: '4600',
        PATH: `${binDir}:${process.env.PATH}`,
        REMDO_FAKE_DOCKER_LOG: dockerLog,
        ...overrides,
      },
    });

    const dockerCalls = fs.existsSync(dockerLog) ? fs.readFileSync(dockerLog, 'utf8') : '';
    return { dataDir, result, dockerCalls };
  }

  it('runs the local Docker app on the host network', () => {
    const { dataDir, result, dockerCalls } = runDockerLauncher();
    const runCall = dockerCalls.split('\n').find((call) => call.startsWith('run ')) ?? '';

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Starting private Docker app: http://localhost:4640');
    expect(dockerCalls).toContain('build ');
    expect(runCall).toContain('--rm --userns=host --name remdo-dev-docker-4640 --network=host');
    expect(runCall).not.toContain(' -p ');
    expect(runCall).toContain('-e APP_PUBLIC_URL=http://localhost:4640');
    expect(runCall).toContain('-e ALLOW_SIGNUP=false');
    expect(runCall).toContain('-e CADDY_SITE_ADDRESSES=http://:4640');
    expect(runCall).toContain('-e CADDY_BIND_DIRECTIVE=bind 127.0.0.1');
    expect(runCall).toContain('-e HOST=127.0.0.1');
    expect(runCall).toContain('-e PORT_BASE=4640');
    expect(runCall).toContain('-e PORT=4640');
    expect(runCall).toContain('-e AUTH_SECRET=development-auth-secret-0123456789');
    expect(runCall).toContain('-e ADMIN_SECRET=development-admin-secret-0123456789');
    expect(runCall).toContain('-e YSWEET_AUTH_KEY=WLo8wx1G1lGKpIDaDjky9npTrV_fW8jCpRVtB8rd');
    expect(runCall).toContain('-e YSWEET_SERVER_TOKEN=AAAgOkIiPro6W2lCzxyW6BDQkuOmTVSfs0MZh-4PGTM_st0');
    expect(runCall).toContain(`-v ${dataDir}/docker-home:/data`);
  });

  it('binds the Docker gateway on all interfaces for a headless VM', () => {
    const { result, dockerCalls } = runDockerLauncher({
      HOST: '0.0.0.0',
      PUBLIC_HOST: 'dev-vm',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Starting private Docker app: http://dev-vm:4640');
    expect(dockerCalls).toContain('-e CADDY_BIND_DIRECTIVE=bind 0.0.0.0');
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
    writeFakeBin(binDir, 'pnpm', `printf '%s|%s|%s|%s\\n' "\${DATA_DIR}" "\${PORT_BASE}" "\${PORT}" "$*" >> "\${REMDO_FAKE_CALL_LOG:?}"
if [ "$*" = "exec tsx ./tools/dev/print-local-gateway-origin.ts" ]; then
  printf 'http://127.0.0.1:%s' "\${PORT}"
fi
`);
    writeFakeBin(binDir, 'concurrently', `printf '%s|%s|%s|%s\\n' "\${DATA_DIR}" "\${PORT_BASE}" "\${PORT}" "$*" >> "\${REMDO_FAKE_CALL_LOG:?}"
`);
    writeFakeBin(binDir, 'curl', `printf '%s|%s|%s|%s\\n' "\${DATA_DIR}" "\${PORT_BASE}" "\${PORT}" "curl $*" >> "\${REMDO_FAKE_CALL_LOG:?}"
exit "\${REMDO_FAKE_CURL_STATUS:-0}"
`);

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
  });

  it('requires the main development gateway before starting the PWA frontend', () => {
    const { calls, result } = runPwaLauncher({ curlStatus: 1 });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('run pnpm dev first');
    expect(calls).not.toContain('run build');
  });
});
