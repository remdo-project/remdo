import process from 'node:process';
import { serve } from '@hono/node-server';
import { config } from '#config';
import { createServerApp } from '@/server/app';

const app = createServerApp();

serve(
  {
    fetch: app.fetch,
    hostname: config.env.HOST,
    port: config.env.REMDO_API_PORT,
  },
  (info) => {
    console.info(`[remdo-api] listening on http://${info.address}:${info.port}`);
  },
);

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
