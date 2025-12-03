import { config } from '../../config';
import { ensureCollabServer } from '../../tools/lib/collab-server-helper';

export default async function collabServerSetup() {
  if (!config.env.COLLAB_ENABLED) {
    return;
  }

  const stop = await ensureCollabServer(true);

  return async () => {
    if (stop) {
      await stop();
    }
  };
}
