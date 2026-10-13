/* eslint-disable node/no-process-env */
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterEach, expect, it } from 'vitest';
import { isPortOpen } from '#tools/net';

const roots: string[] = [];
const children: ChildProcess[] = [];
const fixture = path.resolve('tests/unit/_support/dev-service-fixture.mjs');
const roles = ['api', 'collab', 'mcp', 'web'] as const;
type Role = typeof roles[number];
interface Listener { pid: number; port: number; group: number }

afterEach(async () => {
  const running = children.splice(0);
  const directories = roots.splice(0);
  for (const child of running) {
    try { process.kill(-child.pid!, 'SIGKILL'); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
      child.kill('SIGKILL');
    }
  }
  for (const root of directories) {
    for (const directory of ['services', 'restarted']) {
      const folder = path.join(root, directory);
      if (!fs.existsSync(folder)) continue;
      for (const filename of fs.readdirSync(folder).filter(name => name.endsWith('.json'))) {
        const value = JSON.parse(fs.readFileSync(path.join(folder, filename), 'utf8')) as { group: number };
        try { process.kill(-value.group, 'SIGKILL'); } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
        }
      }
    }
  }
  await Promise.all(running.filter(child => child.exitCode === null && child.signalCode === null).map(child => once(child, 'close')));
  for (const root of directories) fs.rmSync(root, { recursive: true, force: true });
});

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-dev-lifecycle-'));
  roots.push(root);
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  fs.symlinkSync(fixture, path.join(bin, 'pnpm'));
  const directory = path.join(root, 'services');
  fs.mkdirSync(directory);
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    HOST: '127.0.0.1', NODE_ENV: 'development',
    // Ephemeral fixture ports are isolated from every development port block.
    PORT: '0', API_SERVER_PORT: '0', COLLAB_SERVER_PORT: '0', MCP_SERVER_PORT: '0',
    REMDO_DEV_FIXTURE_DIR: directory,
  };
  return { root, directory, env };
}

function start(command: string, args: string[], env: NodeJS.ProcessEnv) {
  const child = spawn(command, args, {
    cwd: process.cwd(), env, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  child.stdout.resume();
  const exit = once(child, 'close');
  return { child, exit, stderr: () => stderr };
}

function launch(env: NodeJS.ProcessEnv, args: string[] = []) {
  return start(process.execPath, ['--import', 'tsx', 'tools/dev/run.ts', ...args], env);
}

async function listeners(directory: string): Promise<Record<Role, Listener>> {
  await expect.poll(() => roles.every(role => fs.existsSync(path.join(directory, `${role}.json`))), { timeout: 15_000 }).toBe(true);
  return Object.fromEntries(roles.map(role => [role, JSON.parse(fs.readFileSync(path.join(directory, `${role}.json`), 'utf8'))])) as Record<Role, Listener>;
}

function ports(values: Record<Role, Listener>) {
  return {
    PORT: String(values.web.port), API_SERVER_PORT: String(values.api.port),
    COLLAB_SERVER_PORT: String(values.collab.port), MCP_SERVER_PORT: String(values.mcp.port),
  };
}

async function availablePortBase(): Promise<number> {
  for (;;) {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1');
    await once(probe, 'listening');
    const base = Math.floor((probe.address() as net.AddressInfo).port / 100) * 100;
    await new Promise<void>(resolve => probe.close(() => resolve()));
    const occupied = await Promise.all(Array.from({ length: 100 }, (_, offset) => isPortOpen('127.0.0.1', base + offset)));
    if (occupied.every(open => !open)) return base;
  }
}

function readEvents(directory: string): string {
  return fs.existsSync(path.join(directory, 'events.txt')) ? fs.readFileSync(path.join(directory, 'events.txt'), 'utf8') : '';
}

async function expectReleased(values: Record<Role, Listener>) {
  for (const role of roles) expect(await isPortOpen('127.0.0.1', values[role].port)).toBe(false);
}

it.each([
  { signal: 'SIGINT', code: 130 }, { signal: 'SIGTERM', code: 143 }, { signal: 'SIGHUP', code: 129 },
] as const)('drains collaboration before Django and releases descendants on $signal', async ({ signal, code }) => {
  const context = setup();
  const run = launch(context.env);
  const values = await listeners(context.directory);
  run.child.kill(signal);
  expect((await run.exit)[0], run.stderr()).toBe(code);
  const events = readEvents(context.directory);
  expect(events).toContain('collab.saved');
  expect(events).not.toContain('collab.save-failed');
  expect(events.indexOf('collab.saved')).toBeLessThan(events.indexOf('api.stopped'));
  await expectReleased(values);
}, 45_000);

it('cleans up after a terminal interrupt through the real pnpm dev command', async () => {
  const context = setup();
  const base = await availablePortBase();
  const env = {
    ...context.env, PORT_BASE: String(base), DATA_DIR: context.root, DATABASE_URL: '',
    // Keep a save in flight long enough to observe a prematurely returning launcher.
    REMDO_DEV_FIXTURE_SAVE_DELAY: '1000',
  };
  const run = start(process.env.npm_execpath!, ['run', 'dev'], env);
  const values = await listeners(context.directory);
  // A terminal interrupt reaches every foreground wrapper, but not owned service groups.
  process.kill(-run.child.pid!, 'SIGINT');
  const [code, signal] = await run.exit;
  expect(code === 130 || signal === 'SIGINT', run.stderr()).toBe(true);
  expect(readEvents(context.directory)).toContain('collab.saved');
  await expectReleased(values);

  for (const role of roles) fs.unlinkSync(path.join(context.directory, `${role}.json`));
  const restarted = start(process.env.npm_execpath!, ['run', 'dev'], env);
  await listeners(context.directory);
  process.kill(-restarted.child.pid!, 'SIGINT');
  await restarted.exit;
  await expectReleased(values);
}, 45_000);

it.each([{ route: '/crash', code: 7 }, { route: '/exit', code: 1 }])('stops every remaining service after unexpected exit $route', async ({ route, code }) => {
  const context = setup();
  const run = launch(context.env);
  const values = await listeners(context.directory);
  await fetch(`http://127.0.0.1:${values.web.port}${route}`).catch(() => {});
  expect((await run.exit)[0], run.stderr()).toBe(code);
  expect(readEvents(context.directory)).toContain('collab.saved');
  await expectReleased(values);
}, 30_000);

it('cleans up siblings when a service fails during startup', async () => {
  const context = setup();
  const run = launch({ ...context.env, REMDO_DEV_FIXTURE_FAIL: 'web' });
  expect((await run.exit)[0], run.stderr()).toBe(7);
  for (const role of ['api', 'collab', 'mcp']) {
    const filename = path.join(context.directory, `${role}.json`);
    if (fs.existsSync(filename)) {
      const value = JSON.parse(fs.readFileSync(filename, 'utf8')) as Listener;
      expect(await isPortOpen('127.0.0.1', value.port)).toBe(false);
    }
  }
}, 30_000);

it('refuses an occupied service address without killing its owner or launching siblings', async () => {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as net.AddressInfo;
  try {
    const context = setup();
    const run = launch({ ...context.env, COLLAB_SERVER_PORT: String(address.port) });
    expect((await run.exit)[0]).toBe(1);
    expect(run.stderr()).toContain(`collab 127.0.0.1:${address.port} is already occupied`);
    expect(await isPortOpen('127.0.0.1', address.port)).toBe(true);
    expect(fs.readdirSync(context.directory)).toEqual([]);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}, 30_000);

it('force recovery preserves Django until the previous collaboration listener has saved', async () => {
  const context = setup();
  for (const role of roles) {
    const child = spawn(process.execPath, [fixture, '--serve', role], { env: context.env, detached: true, stdio: 'ignore' });
    children.push(child);
  }
  const old = await listeners(context.directory);
  const nextDirectory = path.join(context.root, 'restarted');
  fs.mkdirSync(nextDirectory);
  const run = launch({ ...context.env, ...ports(old), REMDO_DEV_FIXTURE_DIR: nextDirectory }, ['--force']);
  const current = await listeners(nextDirectory);
  const events = readEvents(context.directory);
  expect(events).toContain('collab.saved');
  expect(events.indexOf('collab.saved')).toBeLessThan(events.indexOf('api.stopped'));
  run.child.kill('SIGTERM');
  expect((await run.exit)[0], run.stderr()).toBe(143);
  await expectReleased(current);
}, 45_000);

it('escalates to SIGKILL when a managed service ignores graceful termination', async () => {
  const context = setup();
  const run = launch({ ...context.env, REMDO_DEV_FIXTURE_STUBBORN: 'mcp' });
  const values = await listeners(context.directory);
  run.child.kill('SIGTERM');
  await expect.poll(() => readEvents(context.directory)).toContain('mcp.signal');
  expect(await isPortOpen('127.0.0.1', values.api.port)).toBe(true);
  expect((await run.exit)[0], run.stderr()).toBe(143);
  expect(run.stderr()).toContain('mcp exceeded its shutdown deadline; sending SIGKILL');
  expect(readEvents(context.directory)).toContain('collab.saved');
  await expectReleased(values);
}, 45_000);
