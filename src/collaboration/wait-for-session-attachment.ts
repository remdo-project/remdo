import type * as Y from 'yjs';

import type { CollabSession } from './session';
import type { CollaborationProviderInstance } from './runtime';

export async function waitForSessionAttachment(
  session: CollabSession,
  docMap: Map<string, Y.Doc>,
  docId: string,
  timeoutMs = 5000,
): Promise<{ provider: CollaborationProviderInstance; doc: Y.Doc }> {
  const resolveAttachment = () => {
    const provider = session.getProvider();
    const doc = docMap.get(docId);
    if (!provider || !doc) {
      return null;
    }
    return { provider, doc };
  };

  const immediate = resolveAttachment();
  if (immediate) {
    return immediate;
  }

  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    const timeoutHandle = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timed out waiting for collaboration provider for ${docId}`));
    }, timeoutMs);

    const onUpdate = () => {
      const attached = resolveAttachment();
      if (!attached) {
        return;
      }
      clearTimeout(timeoutHandle);
      unsubscribe();
      resolve(attached);
    };

    unsubscribe = session.subscribe(onUpdate);
    onUpdate();
  });
}
