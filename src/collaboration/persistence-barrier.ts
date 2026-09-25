import type { HocuspocusProvider } from '@hocuspocus/provider';
import { decodePersistenceMessage, encodePersistenceMessage } from '#platform/net/persistence-barrier';

const PERSIST_TIMEOUT_MS = 15_000;
let nextRequestId = 0;

/**
 * Resolve once the hub has committed the document's current state, including
 * this provider's already-synchronized updates. Rejects on a failed save, a
 * closed connection, or timeout.
 */
export function requestPersistence(provider: HocuspocusProvider): Promise<void> {
  const id = ++nextRequestId;
  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    function settle(error?: Error) {
      clearTimeout(timer);
      provider.off('stateless', onStateless);
      provider.off('close', onClose);
      if (error) reject(error);
      else resolve();
    }
    function onStateless({ payload }: { payload: string }) {
      const message = decodePersistenceMessage(payload);
      if (message?.id !== id) return;
      settle(message.type === 'persisted' ? undefined : new Error('Collaboration persistence failed.'));
    }
    function onClose() {
      settle(new Error('Collaboration connection closed before persistence completed.'));
    }
    timer = setTimeout(() => settle(new Error('Collaboration persistence timed out.')), PERSIST_TIMEOUT_MS);
    provider.on('stateless', onStateless);
    provider.on('close', onClose);
    provider.sendStateless(encodePersistenceMessage({ type: 'persist', id }));
  });
}
