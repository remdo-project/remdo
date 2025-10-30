import type { Provider } from '@lexical/yjs';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

export type ProviderFactory = (id: string, docMap: Map<string, Y.Doc>) => Provider;

interface ProviderFactorySignals {
  setReady: (value: boolean) => void;
  setUnsynced: (value: boolean) => void;
}

export function createProviderFactory(
  { setReady, setUnsynced }: ProviderFactorySignals,
  endpoint: string
): ProviderFactory {
  return (id: string, docMap: Map<string, Y.Doc>) => {
    setReady(false);
    setUnsynced(true);

    let doc = docMap.get(id);
    if (!doc) {
      doc = new Y.Doc();
      docMap.set(id, doc);
    }

    // Ensure the shared root exists before the provider starts syncing. Yjs warns when
    // collaborative types are accessed prior to being attached to a document, and
    // Lexical expects the `root` XmlText to always be present.
    doc.get('root', Y.XmlText);

    const provider = new WebsocketProvider(endpoint, id, doc, {
      connect: false,
    });

    const markUnsynced = () => {
      setUnsynced(true);
    };

    const clearUnsynced = () => {
      setUnsynced(false);
    };

    const handleDocUpdate = (_update: Uint8Array, origin: unknown) => {
      if (origin === provider) {
        return;
      }

      markUnsynced();
    };

    const handleSync = (isSynced: boolean) => {
      setReady(isSynced);

      if (isSynced) {
        clearUnsynced();
        return;
      }

      markUnsynced();
    };

    const handleStatus = ({ status }: { status: string }) => {
      if (status === 'connecting') {
        setReady(false);
        markUnsynced();
        return;
      }

      if (status === 'connected') {
        if (provider.synced) {
          clearUnsynced();
        }
        return;
      }

      markUnsynced();
    };

    provider.doc.on('update', handleDocUpdate);
    provider.on('sync', handleSync);
    provider.on('status', handleStatus);

    const originalDestroy = provider.destroy.bind(provider);
    provider.destroy = () => {
      provider.doc.off('update', handleDocUpdate);
      provider.off('sync', handleSync);
      provider.off('status', handleStatus);
      originalDestroy();
    };

    return provider as unknown as Provider;
  };
}
