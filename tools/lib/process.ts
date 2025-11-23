import { spawn, type ChildProcess } from 'node:child_process';
import process from 'node:process';

export const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

export function onChildExit(child: ChildProcess): void {
  child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code ?? 0);
    }
  });

  child.on('error', (error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}

export function spawnPnpm(args: string[], env?: NodeJS.ProcessEnv): ChildProcess {
  const child = spawn(pnpmCmd, args, {
    env: { ...process.env, ...env },
    stdio: 'inherit',
    shell: false,
  });

  onChildExit(child);
  return child;
}
