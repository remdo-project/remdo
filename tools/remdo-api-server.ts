import process from 'node:process';
import { serve } from '@hono/node-server';
import { config } from '#config';
import { getServerAuth } from '@/server/auth/auth';
import { createServerApp } from '@/server/app';

async function main() {
  const auth = getServerAuth();
  await auth.ensureReady();
  const app = createServerApp({ auth });

  serve(
    {
      fetch: app.fetch,
      hostname: config.env.HOST,
      port: config.env.API_SERVER_PORT,
    },
    (info) => {
      console.info(`[remdo-api] listening on http://${info.address}:${info.port}`);
    },
  );
}

// CJS bundling for the Docker runner cannot preserve top-level await here.
// eslint-disable-next-line unicorn/prefer-top-level-await
void main().catch((error) => {
  console.error('[remdo-api] failed to start', error);
  // eslint-disable-next-line unicorn/no-process-exit -- this is the CLI entrypoint
  process.exit(1);
});

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
