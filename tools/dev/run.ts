#!/usr/bin/env tsx
import { execFileSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import process from 'node:process';
import { setTimeout as wait } from 'node:timers/promises';
import { config } from '#config';
import { COLLABORATION_SHUTDOWN_DEADLINE_MS } from '#platform/net/django-request';
import { INTERNAL_SERVICE_HOST } from '#platform/net/origins';
import { PERSIST_TIMEOUT_MS } from '#platform/net/persistence-barrier';
import { terminateProcessGroup } from '../lib/managed-process';
import { isPortOpen } from '../lib/net';
import { spawnPnpm } from '../lib/process';

const services = [
  { name: 'api', port: config.env.API_SERVER_PORT, host: INTERNAL_SERVICE_HOST },
  { name: 'collab', port: config.env.COLLAB_SERVER_PORT, host: INTERNAL_SERVICE_HOST },
  { name: 'mcp', port: config.env.MCP_SERVER_PORT, host: INTERNAL_SERVICE_HOST },
  { name: 'web', port: config.env.PORT, host: config.env.HOST === '0.0.0.0' ? INTERNAL_SERVICE_HOST : config.env.HOST },
] as const;
type Service = typeof services[number];
const started: Array<{ service: Service; child: ChildProcess }> = [];
let stopping = false;

function gracePeriod({ name }: Service): number {
  if (name === 'collab') return COLLABORATION_SHUTDOWN_DEADLINE_MS + 5000;
  // A mutation in flight at shutdown can wait out its persistence acknowledgement.
  if (name === 'mcp') return PERSIST_TIMEOUT_MS + 5000;
  return 10_000;
}

async function waitUntil(check: () => boolean | Promise<boolean>, timeout: number): Promise<boolean> {
  const deadline = performance.now() + timeout;
  do {
    if (await check()) return true;
    await wait(100);
  } while (performance.now() < deadline);
  return check();
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
    throw error;
  }
}

function groupExists(child: ChildProcess): boolean {
  if (!child.pid) return false;
  return processExists(process.platform === 'win32' ? child.pid : -child.pid);
}

function signalProcess(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}

function listenerPids(port: number): number[] {
  try {
    const output = execFileSync('lsof', ['-nP', '-t', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
    return [...new Set(output.trim().split(/\s+/u).filter(value => /^\d+$/u.test(value)).map(Number))];
  } catch (error) {
    if ((error as { status?: number }).status === 1) return [];
    throw new Error('Development port recovery requires lsof.', { cause: error });
  }
}

function describeListeners(port: number): string {
  try {
    const pids = listenerPids(port);
    if (pids.length === 0) return '';
    // Executable names identify owners without disclosing credentials in command arguments.
    return execFileSync('ps', ['-p', pids.join(','), '-o', 'pid=,ppid=,comm='], { encoding: 'utf8' }).trim();
  } catch {
    return 'Use lsof to identify the listener.';
  }
}

async function recoverPorts(): Promise<void> {
  const signalled = new Set<number>();
  for (const service of [...services].reverse()) {
    const { name } = service;
    const pids = listenerPids(service.port).filter(pid => !signalled.has(pid));
    for (const pid of pids) {
      console.info(`dev: stopping ${name} listener PID ${pid} on port ${service.port}`);
      signalled.add(pid);
      signalProcess(pid, 'SIGTERM');
    }
    if (pids.length === 0) continue;
    if (!await waitUntil(() => pids.every(pid => !processExists(pid)), gracePeriod(service))) {
      // Recheck socket ownership before escalation rather than trusting an old PID.
      for (const pid of listenerPids(service.port)) {
        console.error(`dev: ${name} listener PID ${pid} exceeded its shutdown deadline; sending SIGKILL`);
        signalProcess(pid, 'SIGKILL');
      }
    }
    if (!await waitUntil(() => listenerPids(service.port).length === 0, 5000)) {
      throw new Error(`dev: could not release ${name} port ${service.port}`);
    }
  }
}

function shutdown(exitCode: number): void {
  if (stopping) return;
  stopping = true;
  process.exitCode = exitCode;
  void (async () => {
    // Reverse start order keeps Django available until MCP and collaboration finish their persistence work.
    for (const { service, child } of [...started].reverse()) {
      const { name } = service;
      try {
        terminateProcessGroup(child, 'SIGTERM');
        if (!await waitUntil(() => !groupExists(child), gracePeriod(service))) {
          console.error(`dev: ${name} exceeded its shutdown deadline; sending SIGKILL`);
          terminateProcessGroup(child, 'SIGKILL');
          if (!await waitUntil(() => !groupExists(child), 5000)) {
            throw new Error(`${name} process group did not exit`);
          }
        }
      } catch (error) {
        console.error(`dev: failed to stop ${name}`, error);
        process.exitCode = 1;
      }
    }
  })().catch(error => {
    console.error('dev: shutdown failed', error);
    process.exitCode = 1;
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--force')) {
    throw new Error('Usage: pnpm run dev or pnpm run dev:force');
  }
  if (args[0] === '--force') await recoverPorts();
  const occupied = (await Promise.all(services.map(async service => ({
    ...service, occupied: await isPortOpen(service.host, service.port),
  })))).filter(service => service.occupied);
  if (occupied.length > 0) {
    throw new Error(occupied.map(service =>
      `dev: ${service.name} ${service.host}:${service.port} is already occupied\n${describeListeners(service.port)}`
    ).join('\n'));
  }

  process.on('SIGINT', () => shutdown(130));
  process.on('SIGTERM', () => shutdown(143));
  process.on('SIGHUP', () => shutdown(129));
  for (const service of services) {
    // Each group is owned here, including pnpm/tsx descendants after their launcher exits.
    const child = spawnPnpm(['run', `dev:${service.name}`], { detached: true, forwardExit: false, stdio: 'inherit' });
    started.push({ service, child });
    child.once('error', error => {
      console.error(`dev: ${service.name} failed to start`, error);
      shutdown(1);
    });
    child.once('close', (code, signal) => {
      if (stopping) return;
      console.error(`dev: ${service.name} exited (${signal ?? code}); stopping the development stack`);
      shutdown(code && code > 0 ? code : 1);
    });
  }
}

await main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  shutdown(1);
});
