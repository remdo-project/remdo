import type { ChildProcess } from 'node:child_process';
import type fs from 'node:fs';
import process from 'node:process';

const TEARDOWN_SIGNALS = ['exit', 'SIGINT', 'SIGTERM'] as const;

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
 * teardown signals that terminate the child. Returns a `cleanup` that
 * unregisters the handlers and closes the log stream.
 */
export function attachManagedProcess(child: ChildProcess, logStream: fs.WriteStream): () => void {
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

  return () => {
    for (const event of TEARDOWN_SIGNALS) {
      process.off(event, onSignal);
    }
    logStream.end();
  };
}
