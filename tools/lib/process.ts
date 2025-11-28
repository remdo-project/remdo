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
  stdio?: 'inherit' | 'ignore' | Array<null | undefined | 'pipe' | 'ignore' | 'inherit' | number | NodeJS.ReadStream | NodeJS.WriteStream>;
}

export function spawnPnpm(
  args: string[],
  options?: SpawnPnpmOptions,
): ChildProcess {
  const { env: envOverrides, forwardExit = true } = options ?? {};
  const child = spawn(pnpmCmd, args, {
    // eslint-disable-next-line node/no-process-env -- merge current env with overrides for the child process
    env: { ...process.env, ...envOverrides },
    stdio: options?.stdio ?? 'inherit',
    shell: false,
  });

  if (forwardExit) {
    onChildExit(child);
  }
  return child;
}

interface RunPnpmOptions extends SpawnPnpmOptions {
  /**
   * Treat non-zero exit codes as errors. Defaults to true.
   */
  rejectOnNonZeroExit?: boolean;
}

/**
 * Convenience wrapper that awaits a pnpm process and resolves when it exits.
 * Useful in tests/CLIs where we don't want the parent process to exit automatically.
 */
export function runPnpm(args: string[], options?: RunPnpmOptions): Promise<void> {
  const { rejectOnNonZeroExit = true, ...spawnOptions } = options ?? {};

  return new Promise<void>((resolve, reject) => {
    const child = spawnPnpm(args, { ...spawnOptions, forwardExit: false });

    child.once('error', reject);
    child.once('close', (code) => {
      if (!rejectOnNonZeroExit || code === 0) {
        resolve();
      } else {
        reject(new Error(`pnpm ${args.join(' ')} exited with code ${code ?? 'null'}`));
      }
    });
  });
}
