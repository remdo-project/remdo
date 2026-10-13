import process from 'node:process';
import { config } from '#config';
import { resolveApiServerOrigin } from '#platform/net/origins';
import { COLLABORATION_SHUTDOWN_DEADLINE_MS } from '#platform/net/django-request';
import { startServerErrorReporting } from '#platform/server-error-reporting';
import { createCollaborationServer } from './server';

await startServerErrorReporting();
const collaboration = createCollaborationServer({
  port: config.env.COLLAB_SERVER_PORT,
  apiOrigin: resolveApiServerOrigin(),
  secret: config.env.COLLAB_INTERNAL_SECRET,
  appOrigin: config.env.APP_ORIGIN,
});
await collaboration.server.listen();
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => {
    console.error('collaboration.shutdown-timeout');
    process.exit(1);
  }, COLLABORATION_SHUTDOWN_DEADLINE_MS);
  try {
    await collaboration.stop();
    clearTimeout(deadline);
    process.exitCode = 0;
  } catch {
    console.error('collaboration.shutdown-failed');
    process.exit(1);
  }
}
process.on('SIGTERM', () => { void stop(); });
process.on('SIGINT', () => { void stop(); });
