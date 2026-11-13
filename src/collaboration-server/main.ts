import process from 'node:process';
import { config } from '#config';
import { resolveApiServerOrigin } from '#platform/net/origins';
import { COLLABORATION_SHUTDOWN_DEADLINE_MS } from '#platform/net/django-request';
import { startServerErrorReporting } from '#platform/server-error-reporting';
import { createCollaborationServer } from './server';

// About 20 s for Django to come up; a room left uncommitted still commits once it is opened.
const PENDING_COMMIT_ATTEMPTS = 10;

await startServerErrorReporting();
const collaboration = createCollaborationServer({
  port: config.env.COLLAB_SERVER_PORT,
  apiOrigin: resolveApiServerOrigin(),
  secret: config.env.COLLAB_INTERNAL_SECRET,
  appOrigin: config.env.APP_ORIGIN,
  documentSlots: config.env.MCP_DOCUMENT_SLOTS,
});
// Before rooms open, so a room's own commit can't race the one its previous run left pending.
for (let attempt = 0; attempt < PENDING_COMMIT_ATTEMPTS && !await collaboration.commitPendingWorkspaces(); attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
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
