import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachManagedProcess, prepareManagedProcessLog } from '#tools/managed-process';

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

function createFakeChild(
  onKill: (child: ChildProcess) => void,
): { child: ChildProcess; stderr: PassThrough; stdout: PassThrough } {
  const stderr = new PassThrough();
  const stdout = new PassThrough();
  const child = Object.assign(new EventEmitter(), {
    exitCode: null,
    killed: false,
    pid: undefined,
    signalCode: null,
    stderr,
    stdout,
  }) as unknown as ChildProcess;
  child.kill = vi.fn(() => {
    onKill(child);
    return true;
  });
  return { child, stderr, stdout };
}

function createLogPath(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-managed-process-'));
  tempDirs.push(tempDir);
  return path.join(tempDir, 'logs', 'child.log');
}

describe('managed process', () => {
  it('cleans up and rejects when spawn emits error without exit', async () => {
    const spawnError = Object.assign(new Error('spawn failed'), { code: 'ENOENT' });
    const { child } = createFakeChild((fakeChild) => {
      queueMicrotask(() => {
        fakeChild.emit('error', spawnError);
        fakeChild.emit('close', -2, null);
      });
    });
    const logPath = createLogPath();
    prepareManagedProcessLog(logPath);
    const initialExitListeners = process.listenerCount('exit');
    const initialSigintListeners = process.listenerCount('SIGINT');
    const initialSigtermListeners = process.listenerCount('SIGTERM');

    const stop = attachManagedProcess(child, logPath);

    await expect(stop()).rejects.toBe(spawnError);
    expect(process.listenerCount('exit')).toBe(initialExitListeners);
    expect(process.listenerCount('SIGINT')).toBe(initialSigintListeners);
    expect(process.listenerCount('SIGTERM')).toBe(initialSigtermListeners);
  });

  it('runs post-exit work before close and flushes trailing output', async () => {
    const events: string[] = [];
    const { child, stderr, stdout } = createFakeChild((fakeChild) => {
      queueMicrotask(() => {
        events.push('exit');
        fakeChild.emit('exit', 0, null);
      });
    });
    const logPath = createLogPath();
    prepareManagedProcessLog(logPath);
    const stop = attachManagedProcess(child, logPath);

    await stop(() => {
      events.push('after-exit');
      stderr.end('trailing stderr\n');
      stdout.end();
      events.push('close');
      child.emit('close', 0, null);
    });

    expect(events).toEqual(['exit', 'after-exit', 'close']);
    expect(fs.readFileSync(logPath, 'utf8')).toBe('trailing stderr\n');
  });
});
