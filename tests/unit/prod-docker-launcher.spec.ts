/* eslint-disable node/no-process-env */
import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  dockerEnvironment,
  dockerOptionValues,
  findDockerCall,
  parseDockerCalls,
} from './_support/docker-calls';
import { writeFakeBin } from './_support/fake-bins';

function writeFakeDocker(binDir: string): void {
  writeFakeBin(binDir, 'docker', `printf '%s\\0' "$#" "$@" >> "\${REMDO_FAKE_DOCKER_LOG:?}"
case "$1" in
  build)
    exit "\${REMDO_FAKE_DOCKER_BUILD_STATUS:-0}"
    ;;
  container)
    [ "$2" = inspect ]
    [ "\${REMDO_FAKE_CONTAINER_EXISTS:-false}" = true ]
    [ ! -e "\${REMDO_FAKE_DOCKER_STOPPED:?}" ]
    ;;
  stop)
    : > "\${REMDO_FAKE_DOCKER_STOPPED:?}"
    ;;
  rm)
    ;;
  run)
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
  dockerCalls: string[][];
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

  function runLauncher(overrides: Record<string, string> = {}): LauncherRun {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-prod-docker-launcher-'));
    tempDirs.push(tempDir);
    const binDir = path.join(tempDir, 'bin');
    const dataDir = path.join(tempDir, 'data');
    const dockerLog = path.join(tempDir, 'docker.log');
    const dockerStopped = path.join(tempDir, 'docker.stopped');
    fs.mkdirSync(binDir);
    writeFakeDocker(binDir);

    const result = spawnSync('./tools/prod/docker.sh', {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        ADMIN_SECRET: 'production-admin-secret-0123456789',
        ALLOW_SIGNUP: '',
        APP_ORIGIN: 'https://remdo.localhost:8443',
        AUTH_SECRET: 'production-auth-secret-0123456789',
        CADDY_BIND_DIRECTIVE: 'bind 0.0.0.0',
        CADDY_SITE_ADDRESS: 'http://:9998',
        DATA_DIR: dataDir,
        HOST: '',
        PATH: `${binDir}:${process.env.PATH}`,
        PORT: '9999',
        PORT_BASE: '9000',
        REMDO_DOCKER_NETWORK: 'host',
        REMDO_FAKE_DOCKER_LOG: dockerLog,
        REMDO_FAKE_DOCKER_STOPPED: dockerStopped,
        REMDO_GATEWAY_BIND_ADDRESS: '127.0.0.1',
        YSWEET_AUTH_KEY: 'production-ysweet-auth-key',
        YSWEET_SERVER_TOKEN: 'production-ysweet-server-token',
        ...overrides,
      },
    });

    const dockerCalls = fs.existsSync(dockerLog) ? parseDockerCalls(fs.readFileSync(dockerLog, 'utf8')) : [];
    return { dataDir, result, dockerCalls };
  }

  it('publishes only the canonical gateway port on loopback by default', () => {
    const { dataDir, result, dockerCalls } = runLauncher();

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Docker target: https://remdo.localhost:8443');
    expect(dockerCalls.some(([command]) => command === 'build')).toBe(true);
    const runArgs = findDockerCall(dockerCalls, 'run');

    expect(dockerOptionValues(runArgs, '--name')).toEqual(['remdo-8443']);
    expect(dockerOptionValues(runArgs, '-p')).toEqual(['127.0.0.1:8443:8443']);
    expect(dockerOptionValues(runArgs, '-v')).toEqual([`${dataDir}:/data`]);
    expect(runArgs).not.toContain('--network=host');
    expect(dockerEnvironment(runArgs)).toEqual({
      ADMIN_SECRET: 'production-admin-secret-0123456789',
      APP_ORIGIN: 'https://remdo.localhost:8443',
      ALLOW_SIGNUP: 'false',
      AUTH_SECRET: 'production-auth-secret-0123456789',
      YSWEET_AUTH_KEY: 'production-ysweet-auth-key',
      YSWEET_SERVER_TOKEN: 'production-ysweet-server-token',
    });
  });

  it('starts cleanly without stopping a container that does not exist', () => {
    const { result, dockerCalls } = runLauncher();

    expect(result.status, result.stderr).toBe(0);
    expect(dockerCalls.map(([command]) => command)).toEqual(['build', 'container', 'run']);
    expect(dockerCalls[1]).toEqual(['container', 'inspect', 'remdo-8443']);
  });

  it('replaces only the port-derived container after a successful build', () => {
    const { result, dockerCalls } = runLauncher({ REMDO_FAKE_CONTAINER_EXISTS: 'true' });

    expect(result.status, result.stderr).toBe(0);
    expect(dockerCalls.map(([command]) => command)).toEqual([
      'build',
      'container',
      'stop',
      'rm',
      'container',
      'run',
    ]);
    expect(findDockerCall(dockerCalls, 'stop')).toEqual(['stop', 'remdo-8443']);
    expect(findDockerCall(dockerCalls, 'rm')).toEqual(['rm', 'remdo-8443']);
    expect(dockerOptionValues(findDockerCall(dockerCalls, 'run'), '--name')).toEqual(['remdo-8443']);
  });

  it('leaves the existing container running when the image build fails', () => {
    const { result, dockerCalls } = runLauncher({
      REMDO_FAKE_CONTAINER_EXISTS: 'true',
      REMDO_FAKE_DOCKER_BUILD_STATUS: '23',
    });

    expect(result.status).toBe(23);
    expect(dockerCalls).toHaveLength(1);
    expect(dockerCalls[0]?.[0]).toBe('build');
  });

  it('publishes the canonical default HTTPS port on every IPv4 interface when requested', () => {
    const { result, dockerCalls } = runLauncher({
      APP_ORIGIN: 'https://remdo.example.com',
      HOST: '0.0.0.0',
    });

    expect(result.status, result.stderr).toBe(0);
    const runArgs = findDockerCall(dockerCalls, 'run');
    expect(dockerOptionValues(runArgs, '-p')).toEqual(['0.0.0.0:443:443']);
  });

  it('rejects a missing or non-canonical HTTPS public origin before building', () => {
    for (const appOrigin of [
      '',
      'http://remdo.example.com',
      'https://remdo.example.com/path',
    ]) {
      const { result, dockerCalls } = runLauncher({ APP_ORIGIN: appOrigin });

      expect(result.status).not.toBe(0);
      expect(dockerCalls).toEqual([]);
    }
  });

  it('requires persistent data and strong operator secrets before building', () => {
    for (const [name, value, message] of [
      ['DATA_DIR', '', 'Set DATA_DIR'],
      ['ADMIN_SECRET', 'short', 'ADMIN_SECRET must be at least 32 characters'],
      ['AUTH_SECRET', 'short', 'AUTH_SECRET must be at least 32 characters'],
    ] as const) {
      const { result, dockerCalls } = runLauncher({ [name]: value });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(message);
      expect(dockerCalls).toEqual([]);
    }
  });

  it('rejects every production HOST except loopback and the IPv4 wildcard', () => {
    for (const host of ['localhost', '192.0.2.10', '::1']) {
      const { result, dockerCalls } = runLauncher({ HOST: host });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('HOST must be 127.0.0.1 or 0.0.0.0 in production');
      expect(dockerCalls).toEqual([]);
    }
  });

  it('rejects direct exposure on a nonstandard HTTPS port', () => {
    const { result, dockerCalls } = runLauncher({ HOST: '0.0.0.0' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('requires APP_ORIGIN to use the default HTTPS port 443');
    expect(dockerCalls).toEqual([]);
  });

  it('rejects ports reserved for container-internal services', () => {
    for (const port of ['4004', '4011']) {
      const { result, dockerCalls } = runLauncher({
        APP_ORIGIN: `https://remdo.localhost:${port}`,
      });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(`container-reserved port ${port}`);
      expect(dockerCalls).toEqual([]);
    }
  });

  it('omits bootstrap-managed secrets when unset', () => {
    const { result, dockerCalls } = runLauncher({
      AUTH_SECRET: '',
      YSWEET_AUTH_KEY: '',
      YSWEET_SERVER_TOKEN: '',
    });

    expect(result.status, result.stderr).toBe(0);
    expect(dockerEnvironment(findDockerCall(dockerCalls, 'run'))).toEqual({
      ADMIN_SECRET: 'production-admin-secret-0123456789',
      APP_ORIGIN: 'https://remdo.localhost:8443',
      ALLOW_SIGNUP: 'false',
    });
  });

  it('rejects a browser-blocked port derived from the public origin', () => {
    const { result, dockerCalls } = runLauncher({
      APP_ORIGIN: 'https://remdo.localhost:6666',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Port 6666 is blocked by Chromium');
    expect(dockerCalls).toEqual([]);
  });
});
