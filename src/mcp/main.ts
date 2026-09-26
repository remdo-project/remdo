import process from 'node:process';
import { config } from '#config';
import { resolveApiServerOrigin, resolveMcpServerOrigin } from '#platform/net/origins';
import { documentSlotsForHeap } from './document-slots';
import { createMcpServer } from './server';

const server = createMcpServer({
  origin: resolveMcpServerOrigin(),
  apiOrigin: resolveApiServerOrigin(),
  appOrigin: config.env.APP_ORIGIN,
  documentSlots: documentSlotsForHeap(),
});
await server.listen();
function stop() {
  server.stop().then(() => { process.exitCode = 0; }, () => process.exit(1));
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
