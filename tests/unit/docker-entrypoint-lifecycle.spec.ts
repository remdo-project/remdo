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
printf '%s credentials auth=%s database=%s collaboration=%s admin=%s user=%s\\n' "$child_name" "\${AUTH_SECRET+x}" "\${DATABASE_URL+x}" "\${COLLAB_INTERNAL_SECRET+x}" "\${REMDO_ADMIN_PASSWORD+x}" "\${REMDO_USER_PASSWORD+x}" >> "$events"
while :; do
  if [ "\${REMDO_FAKE_EXIT_CHILD:-}" = "$child_name" ] && [ -e "\${REMDO_FAKE_EXIT_TRIGGER:-}" ]; then
    exit_status="\${REMDO_FAKE_EXIT_STATUS:-0}"
    echo "$child_name unexpected $exit_status" >> "$events"
    exit "$exit_status"
  fi
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

const services = ['api', 'caddy', 'collaboration'] as const;
const lifecycleCases = [
  {
    exitCode: 130,
    signal: 'SIGINT',
    signalName: 'INT',
    title: 'handles SIGINT, drains collaboration before Django, and waits for every service',
    type: 'signal',
  },
  {
    exitCode: 143,
    signal: 'SIGTERM',
    signalName: 'TERM',
    title: 'handles SIGTERM, drains collaboration before Django, and waits for every service',
    type: 'signal',
  },
  {
    exitCode: 1,
    failedService: 'api',
    failedStatus: 0,
    forceSurvivors: true,
    title: 'forces surviving services to stop when api exits unexpectedly',
    type: 'exit',
  },
  {
    exitCode: 17,
    failedService: 'caddy',
    failedStatus: 17,
    title: 'fails the instance when caddy exits unexpectedly',
    type: 'exit',
  },
  {
    exitCode: 42,
    failedService: 'collaboration',
    failedStatus: 42,
    title: 'fails the instance when collaboration exits unexpectedly',
    type: 'exit',
  },
] as const;

it.each(lifecycleCases)('$title', async (lifecycleCase) => {
  const forceSurvivors = 'forceSurvivors' in lifecycleCase;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-entrypoint-lifecycle-'));
  const binDir = path.join(tempDir, 'bin');
  const dataDir = path.join(tempDir, 'data');
  const eventsPath = path.join(tempDir, 'events');
  const pidDir = path.join(tempDir, 'pids');
  const releasePath = path.join(tempDir, 'release');
  const exitTriggerPath = path.join(tempDir, 'exit-trigger');
  const childPath = path.join(tempDir, 'managed-child');
  const entrypointPath = path.join(tempDir, 'entrypoint.sh');
  fs.mkdirSync(binDir);
  fs.mkdirSync(pidDir);
  writeManagedChild(childPath);

  for (const name of ['caddy']) {
    writeFakeBin(binDir, name, `exec "\${REMDO_FAKE_CHILD:?}" ${name}\n`);
  }
  writeFakeBin(binDir, 'node', `exec "\${REMDO_FAKE_CHILD:?}" collaboration\n`);
  writeFakeBin(binDir, 'gunicorn', `exec "\${REMDO_FAKE_CHILD:?}" api\n`);
  writeFakeBin(binDir, 'python', `if [ "\${1:-}" = manage.py ]; then
  printf 'django %s admin=%s user=%s\\n' "\${2:-}" "\${REMDO_ADMIN_PASSWORD+x}" "\${REMDO_USER_PASSWORD+x}" >> "\${REMDO_FAKE_EVENTS:?}"
  exit 0
fi
if [ "\${1:-}" = -c ]; then
  case "\${2:-}" in
    *settings.COLLAB_INTERNAL_SECRET*) echo test-internal-secret ;;
    *) exec python3 "$@" ;;
  esac
fi
`);

  // The image installs these two repository files at absolute paths. Adjust
  // only those installation paths so the real entrypoint can run on the host.
  const entrypoint = fs.readFileSync('docker/entrypoint.sh', 'utf8')
    .replace('/usr/local/share/remdo/env.defaults.sh', path.resolve('tools/env.defaults.sh'))
    .replace('/usr/local/share/remdo/entrypoint-env.sh', path.resolve('docker/entrypoint-env.sh'))
    .replace('shutdown_attempts=100', 'shutdown_attempts=10')
    .replace('shutdown_attempts=300', 'shutdown_attempts=30');
  fs.writeFileSync(entrypointPath, entrypoint);

  const child = spawn('/usr/bin/env', ['--default-signal=INT', 'bash', entrypointPath], {
    env: {
      ...process.env,
      _remdo_port_base_offset: '',
      APP_ORIGIN: 'https://remdo.localhost:8443',
      AUTH_SECRET: 'production-auth-secret-0123456789',
      DATABASE_URL: 'postgresql://fixture:fixture@database.invalid/remdo',
      DATA_DIR: dataDir,
      NODE_ENV: 'test',
      PATH: `${binDir}:${process.env.PATH}`,
      PORT_BASE: '4100',
      REMDO_FAKE_CHILD: childPath,
      REMDO_FAKE_EVENTS: eventsPath,
      REMDO_FAKE_EXIT_CHILD: lifecycleCase.type === 'exit' ? lifecycleCase.failedService : '',
      REMDO_FAKE_EXIT_STATUS: lifecycleCase.type === 'exit' ? String(lifecycleCase.failedStatus) : '0',
      REMDO_FAKE_EXIT_TRIGGER: exitTriggerPath,
      REMDO_FAKE_PID_DIR: pidDir,
      REMDO_FAKE_RELEASE: releasePath,
      REMDO_ADMIN_PASSWORD: 'admin-password',
      REMDO_DEV_CONTAINER: 'false',
      REMDO_USER_PASSWORD: 'user-password',
      REMDO_ROOT: process.cwd(),
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => stderr += String(chunk));

  try {
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(child.exitCode, stderr).toBeNull();
    expect(stderr).toBe('');
    await expect.poll(() => readEvents(eventsPath), { timeout: 3_000 })
      .toEqual(expect.arrayContaining(services.map(name => `${name} start`)));
    await expect.poll(() => readEvents(eventsPath)).toEqual(expect.arrayContaining([
      'django setup_configured_users admin=x user=x',
      'api credentials auth=x database=x collaboration=x admin= user=',
      'collaboration credentials auth= database= collaboration=x admin= user=',
    ]));
    expect(child.exitCode, stderr).toBeNull();

    if (lifecycleCase.type === 'signal') {
      expect(child.kill(lifecycleCase.signal)).toBe(true);
      await expect.poll(() => readEvents(eventsPath), { timeout: 3_000 })
        .toContain(`caddy signal ${lifecycleCase.signalName}`);
      expect(readEvents(eventsPath)).not.toContain(`api signal ${lifecycleCase.signalName}`);
      expect(child.exitCode, stderr).toBeNull();
    } else {
      fs.writeFileSync(exitTriggerPath, '');
      await expect.poll(() => stderr, { timeout: 3_000 })
        .toContain(`Production service ${lifecycleCase.failedService} exited unexpectedly with status ${lifecycleCase.failedStatus}.`);
    }
    if (!forceSurvivors) fs.writeFileSync(releasePath, '');

    await expect.poll(() => child.exitCode, { timeout: 6_000 }).toBe(lifecycleCase.exitCode);
    if (forceSurvivors) {
      expect(stderr).toContain('Production service caddy exceeded its shutdown deadline.');
      expect(stderr).toContain('Production service collaboration exceeded its shutdown deadline.');
    }
    if (lifecycleCase.type === 'signal') {
      const events = readEvents(eventsPath);
      expect(events).toEqual(expect.arrayContaining(services.map(name => `${name} exit`)));
      expect(events.indexOf('collaboration exit')).toBeLessThan(events.indexOf(`api signal ${lifecycleCase.signalName}`));
    }
    else {
      const survivingServices = services.filter(name => name !== lifecycleCase.failedService);
      const expectedEvents = [`${lifecycleCase.failedService} unexpected ${lifecycleCase.failedStatus}`];
      if (!forceSurvivors) {
        expectedEvents.push(...survivingServices.map(name => `${name} exit`));
      }
      expect(readEvents(eventsPath)).toEqual(expect.arrayContaining(expectedEvents));
    }
  }
  finally {
    fs.writeFileSync(releasePath, '');
    if (child.exitCode === null) {
      child.kill('SIGKILL');
    }
    for (const name of fs.readdirSync(pidDir)) {
      killIfRunning(Number(fs.readFileSync(path.join(pidDir, name), 'utf8')));
    }
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
}, 10_000);
