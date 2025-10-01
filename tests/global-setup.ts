import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';

const HOST = process.env.WS_HOST ?? '127.0.0.1';
const PORT = Number(process.env.WS_PORT ?? 8080);

const RETRIES = 5;
const RETRY_DELAY_MS = 500;

function isPortOpen(): Promise<boolean> {
  // Bind; only EADDRINUSE => "already open"
  return new Promise((resolve) => {
    const s = net
      .createServer()
      .once('error', (err: NodeJS.ErrnoException) => resolve(err.code === 'EADDRINUSE'))
      .once('listening', () => s.close(() => resolve(false)))
      .listen(PORT, HOST);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForPort(): Promise<void> {
  for (let i = 0; i < RETRIES; i++) {
    if (await isPortOpen()) return;
    if (i < RETRIES - 1) await sleep(RETRY_DELAY_MS);
  }
  throw new Error(`WS server did not open ${HOST}:${PORT} after ${RETRIES} retries`);
}

// Works for both Vitest (receives context) and Playwright (no args)
export default async function globalSetup(ctx?: { provide?: (k: string, v: any) => void }) {
  let child: ChildProcess | undefined;
  let startedServer = false;

  const terminate = async () => {
    if (!child || !startedServer) return;
    if (child.pid === undefined) {
      startedServer = false;
      child = undefined;
      return;
    }

    const tryKill = async (signal: NodeJS.Signals) => {
      if (!child) return;

      if (child.pid) {
        try {
          process.kill(-child.pid, signal);
        } catch (error: any) {
          if (error?.code !== 'ESRCH') throw error;
        }
      }

      try {
        await Promise.race([
          once(child, 'exit').then(() => true),
          sleep(RETRY_DELAY_MS).then(() => false),
        ]);
      } catch {
        // Ignore errors if process already exited or listener can't attach
      }
    };

    await tryKill('SIGTERM');

    if (await isPortOpen()) {
      await tryKill('SIGINT');
    }

    if (await isPortOpen()) {
      await tryKill('SIGKILL');
    }

    for (let i = 0; i < RETRIES && (await isPortOpen()); i++) {
      await sleep(RETRY_DELAY_MS);
    }

    if (await isPortOpen()) {
      throw new Error(`WS server still listening on ${HOST}:${PORT} after teardown`);
    }

    startedServer = false;
    child = undefined;
  };

  if (!(await isPortOpen())) {
    child = spawn('npm', ['run', 'websocket'], {
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env, WS_HOST: HOST, WS_PORT: String(PORT) },
      detached: true,
    });
    child.unref();
    startedServer = true;
    try {
      await waitForPort();
    } catch (error) {
      await terminate();
      throw error;
    }
  }

  // Share values
  process.env.WS_HOST = HOST;
  process.env.WS_PORT = String(PORT);
  process.env.WS_BASE_WS = `ws://${HOST}:${PORT}`;

  // If running under Vitest, also provide injectables
  ctx?.provide?.('wsPort', PORT);
  ctx?.provide?.('wsBaseUrl', process.env.WS_BASE_WS);

  // Teardown (only if *we* started it)
  return terminate;
}
