import process from 'node:process';
import { serve } from '@hono/node-server';
import { config } from '#config';
import { createServerRuntime } from '#server/runtime';

let runtime: ReturnType<typeof createServerRuntime> | null = null;

async function main() {
  runtime = createServerRuntime();
  await runtime.auth.ensureReady();

  serve(
    {
      fetch: runtime.app.fetch,
      hostname: config.env.HOST,
      port: config.env.API_SERVER_PORT,
    },
    (info) => {
      console.info(`[remdo-api] listening on http://${info.address}:${info.port}`);
    },
  );
}

// CJS bundling for the Docker runner cannot preserve top-level await here.
void main().catch((error) => {
  console.error('[remdo-api] failed to start', error);
  process.exit(1);
});

function shutdown(): void {
  void (runtime?.close() ?? Promise.resolve()).finally(() => {
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
