import { config } from '#config';
import { ensureCollabServer } from '../../../../tools/lib/collab-server-helper';

export default async function setupCollabServer() {
  if (config.env.COLLAB_ENABLED) {
    return ensureCollabServer();
  }
}
