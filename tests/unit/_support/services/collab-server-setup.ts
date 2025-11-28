import { config } from '#config';
import { ensureCollabServer } from '#tools/collab-server-helper';

export default async function setupCollabServer() {
  if (config.env.COLLAB_ENABLED) {
    return ensureCollabServer(true);
  }
}
