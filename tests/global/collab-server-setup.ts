import process from 'node:process';
import { config } from '../../config';
import { ensureCollabServer } from '../../tools/lib/collab-server-helper';
import { ensureRemdoApiServer } from '../../tools/lib/remdo-api-server-helper';

export default async function collabServerSetup() {
  // eslint-disable-next-line node/no-process-env -- docker E2E uses env-only flag
  if (process.env.E2E_DOCKER === 'true') {
    return;
  }

  if (!config.env.COLLAB_ENABLED) {
    return;
  }

  const stop = await ensureCollabServer(true);
  const stopApi = await ensureRemdoApiServer(true);

  return async () => {
    if (stopApi) {
      await stopApi();
    }
    if (stop) {
      await stop();
    }
  };
}
