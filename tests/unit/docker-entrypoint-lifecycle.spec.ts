/* eslint-disable node/no-process-env */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { expect, it } from 'vitest';
import { writeFakeBin } from './_support/fake-bins';

function readEvents(eventsPath: string): string[] {
  if (!fs.existsSync(eventsPath)) {
    return [];
  }
  return fs.readFileSync(eventsPath, 'utf8').trim().split('\n').filter(Boolean);
}

function writeManagedChild(childPath: string): void {
  fs.writeFileSync(childPath, `#!/usr/bin/env sh
set -eu

child_name="$1"
events="\${REMDO_FAKE_EVENTS:?}"
release="\${REMDO_FAKE_RELEASE:?}"
printf '%s' "$$" > "\${REMDO_FAKE_PID_DIR:?}/$child_name"

finish() {
  signal="$1"
  printf '%s signal %s\\n' "$child_name" "$signal" >> "$events"
  while [ ! -e "$release" ]; do
    sleep 0.02
  done
  printf '%s exit\\n' "$child_name" >> "$events"
  exit 0
}

trap 'finish INT' INT
trap 'finish TERM' TERM
printf '%s start\\n' "$child_name" >> "$events"
while :; do
  sleep 0.02
done
`);
  fs.chmodSync(childPath, 0o755);
}

function killIfRunning(pid: number): void {
  try {
    process.kill(pid, 'SIGKILL');
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
      throw error;
    }
  }
}

it.each([
  ['SIGINT', 'INT', 130],
  ['SIGTERM', 'TERM', 143],
] as const)('forwards %s to every service and waits for them to exit', async (signal, signalName, exitCode) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-entrypoint-lifecycle-'));
  const binDir = path.join(tempDir, 'bin');
  const dataDir = path.join(tempDir, 'data');
  const eventsPath = path.join(tempDir, 'events');
  const pidDir = path.join(tempDir, 'pids');
  const releasePath = path.join(tempDir, 'release');
  const childPath = path.join(tempDir, 'managed-child');
  const entrypointPath = path.join(tempDir, 'entrypoint.sh');
  fs.mkdirSync(binDir);
  fs.mkdirSync(pidDir);
  writeManagedChild(childPath);

  for (const name of ['caddy', 'crond', 'y-sweet']) {
    writeFakeBin(binDir, name, `exec "\${REMDO_FAKE_CHILD:?}" ${name}\n`);
  }
  writeFakeBin(binDir, 'node', `if [ "\${1:-}" = -e ]; then
  exec "\${REMDO_REAL_NODE:?}" "$@"
fi
exec "\${REMDO_FAKE_CHILD:?}" api
`);

  // The image installs these two repository files at absolute paths. Adjust
  // only those installation paths so the real entrypoint can run on the host.
  const entrypoint = fs.readFileSync('docker/entrypoint.sh', 'utf8')
    .replace('/usr/local/share/remdo/env.defaults.sh', path.resolve('tools/env.defaults.sh'))
    .replace('/usr/local/share/remdo/entrypoint-env.sh', path.resolve('docker/entrypoint-env.sh'));
  fs.writeFileSync(entrypointPath, entrypoint);

  const child = spawn('/usr/bin/env', ['--default-signal=INT', 'bash', entrypointPath], {
    env: {
      ...process.env,
      _remdo_port_base_offset: '',
      ADMIN_SECRET: 'production-admin-secret-0123456789',
      APP_ORIGIN: 'https://remdo.localhost:8443',
      AUTH_SECRET: 'production-auth-secret-0123456789',
      DATA_DIR: dataDir,
      NODE_ENV: 'test',
      PATH: `${binDir}:${process.env.PATH}`,
      PORT_BASE: '4100',
      REMDO_FAKE_CHILD: childPath,
      REMDO_FAKE_EVENTS: eventsPath,
      REMDO_FAKE_PID_DIR: pidDir,
      REMDO_FAKE_RELEASE: releasePath,
      REMDO_REAL_NODE: process.execPath,
      REMDO_DEV_CONTAINER: 'false',
      REMDO_ROOT: process.cwd(),
      YSWEET_AUTH_KEY: 'production-ysweet-auth-key',
      YSWEET_SERVER_TOKEN: 'production-ysweet-server-token',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => stderr += String(chunk));

  try {
    const services = ['api', 'caddy', 'crond', 'y-sweet'];
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(child.exitCode, stderr).toBeNull();
    expect(stderr).toBe('');
    await expect.poll(() => readEvents(eventsPath), { timeout: 3_000 })
      .toEqual(expect.arrayContaining(services.map(name => `${name} start`)));
    expect(child.exitCode, stderr).toBeNull();

    expect(child.kill(signal)).toBe(true);
    await expect.poll(() => readEvents(eventsPath), { timeout: 3_000 })
      .toEqual(expect.arrayContaining(services.map(name => `${name} signal ${signalName}`)));

    // Every child has received the signal but deliberately remains alive. The
    // entrypoint must therefore still be waiting rather than exiting early.
    expect(child.exitCode, stderr).toBeNull();
    fs.writeFileSync(releasePath, '');

    await expect.poll(() => child.exitCode, { timeout: 3_000 }).toBe(exitCode);
    expect(readEvents(eventsPath)).toEqual(expect.arrayContaining(
      services.map(name => `${name} exit`),
    ));
  }
  finally {
    fs.writeFileSync(releasePath, '');
    if (child.exitCode === null) {
      child.kill('SIGKILL');
      for (const name of fs.readdirSync(pidDir)) {
        killIfRunning(Number(fs.readFileSync(path.join(pidDir, name), 'utf8')));
      }
    }
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
}, 10_000);
