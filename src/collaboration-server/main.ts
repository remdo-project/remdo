import process from 'node:process';
import { config } from '#config';
import { resolveApiServerOrigin } from '#platform/net/origins';
import { createCollaborationServer, DJANGO_REQUEST_TIMEOUT_MS } from './server';

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
  // One in-flight request can hold the save mutex before the final save starts.
  const deadline = setTimeout(() => {
    console.error('collaboration.shutdown-timeout');
    process.exit(1);
  }, 2 * DJANGO_REQUEST_TIMEOUT_MS + 5000);
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
