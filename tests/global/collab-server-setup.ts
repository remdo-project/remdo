import { config } from '../../config';
import { ensureCollabServer } from '../../tools/lib/collab-server-helper';
import { ensureRemdoApiServer } from '../../tools/lib/remdo-api-server-helper';
import { cleanupTestAuthData } from './test-auth-cleanup';

export default async function collabServerSetup() {
  if (!config.env.COLLAB_ENABLED) {
    return;
  }

  const stop = await ensureCollabServer({
    port: config.env.COLLAB_SERVER_PORT,
  });
  const stopApi = await ensureRemdoApiServer({
    port: config.env.API_SERVER_PORT,
    ySweetConnectionString: config.env.YSWEET_CONNECTION_STRING,
  });
  cleanupTestAuthData();

  const stopServices = async () => {
    await stopApi();
    await stop();
  };

  return stopServices;
}
