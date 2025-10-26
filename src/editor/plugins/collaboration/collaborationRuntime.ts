import type { Provider } from '@lexical/yjs';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

export type ProviderFactory = (id: string, docMap: Map<string, Y.Doc>) => Provider;

export function createProviderFactory(setReady: (value: boolean) => void, endpoint: string): ProviderFactory {
  return (id: string, docMap: Map<string, Y.Doc>) => {
    setReady(false);

    let doc = docMap.get(id);
    if (!doc) {
      doc = new Y.Doc();
      docMap.set(id, doc);
    }

    const provider = new WebsocketProvider(endpoint, id, doc, {
      connect: false,
    });

    provider.on('sync', (isSynced: boolean) => {
      if (isSynced) {
        setReady(true);
      }
    });

    provider.on('status', (event: { status: string }) => {
      if (event.status === 'connecting') {
        setReady(false);
      }
    });

    return provider as unknown as Provider;
  };
}
