import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { finished } from 'node:stream/promises';

const TEARDOWN_SIGNALS = ['exit', 'SIGINT', 'SIGTERM'] as const;

export function readRecentLog(logPath: string): string {
  try {
    return fs.readFileSync(logPath, 'utf8').trim().slice(-2000);
  } catch {
    return '';
  }
}

export function prepareManagedProcessLog(logPath: string): void {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
}

export function terminateProcessGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.killed) {
    return;
  }

  if (child.pid && process.platform !== 'win32') {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Fallback to direct child kill when group signaling fails.
    }
  }

  child.kill(signal);
}

/**
 * Pipes the child's stdout/stderr into the log stream and registers process
 * teardown signals that terminate the child. Returns a stop operation that
 * terminates the process group, unregisters the handlers, and closes the log.
 */
export function attachManagedProcess(
  child: ChildProcess,
  logPath: string,
): (afterChildExit?: () => void | Promise<void>) => Promise<void> {
  const logStream = fs.createWriteStream(logPath, { flags: 'w' });
  if (child.stdout) {
    child.stdout.pipe(logStream, { end: false });
  }
  if (child.stderr) {
    child.stderr.pipe(logStream, { end: false });
  }

  const onSignal = () => {
    terminateProcessGroup(child, 'SIGTERM');
  };
  for (const event of TEARDOWN_SIGNALS) {
    process.on(event, onSignal);
  }
  const exitPromise = once(child, 'exit');
  const closePromise = once(child, 'close');

  return async (afterChildExit?: () => void | Promise<void>) => {
    terminateProcessGroup(child, 'SIGTERM');
    await exitPromise;
    await afterChildExit?.();
    await closePromise;
    for (const event of TEARDOWN_SIGNALS) {
      process.off(event, onSignal);
    }
    logStream.end();
    await finished(logStream);
  };
}
