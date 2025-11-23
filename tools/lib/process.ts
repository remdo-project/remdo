import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import process from 'node:process';

export const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

export function onChildExit(child: ChildProcess): void {
  child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exitCode = code ?? 0;
    }
  });

  child.on('error', (error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

interface SpawnPnpmOptions {
  env?: NodeJS.ProcessEnv;
  forwardExit?: boolean;
}

export function spawnPnpm(
  args: string[],
  options?: SpawnPnpmOptions,
): ChildProcess {
  const { env: envOverrides, forwardExit = true } = options ?? {};
  const child = spawn(pnpmCmd, args, {
    // eslint-disable-next-line node/no-process-env -- merge current env with overrides for the child process
    env: { ...process.env, ...envOverrides },
    stdio: 'inherit',
    shell: false,
  });

  if (forwardExit) {
    onChildExit(child);
  }
  return child;
}
