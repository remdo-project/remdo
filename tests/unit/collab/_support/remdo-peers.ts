import type { RemdoTestApi } from '@/editor/plugins/dev';
import { renderCollabEditor } from './_internal/render-collab-editor';

export async function createCollabPeer(remdo: RemdoTestApi): Promise<RemdoTestApi> {
  const peer = await renderCollabEditor({ docId: remdo.getCollabDocId() });
  await Promise.all([remdo.waitForSynced(), peer.waitForSynced()]);
  return peer;
}
