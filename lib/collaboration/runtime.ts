import type { Provider } from '@lexical/yjs';
import { createYjsProvider } from '@y-sweet/client';
import type { ClientToken } from '@y-sweet/sdk';
import * as Y from 'yjs';
import type { EndpointResolver } from './endpoints';

export type CollaborationProviderInstance = Provider & { destroy: () => void };

export type ProviderFactory = (id: string, docMap: Map<string, Y.Doc>) => CollaborationProviderInstance;

export class CollaborationSyncController {
  private readonly setState: (value: boolean) => void;

  constructor(setState: (value: boolean) => void) {
    this.setState = setState;
  }

  setSyncing(value: boolean) {
    this.setState(value);
  }
}

interface ProviderFactorySignals {
  setReady: (value: boolean) => void;
  syncController: CollaborationSyncController;
}

const docInitPromises = new Map<string, Promise<void>>();

export function createProviderFactory(
  { setReady, syncController }: ProviderFactorySignals,
  resolveEndpoints: EndpointResolver
): ProviderFactory {
  return (id: string, docMap: Map<string, Y.Doc>) => {
    setReady(false);

    let doc = docMap.get(id);
    if (!doc) {
      doc = new Y.Doc();
      docMap.set(id, doc);
    }

    // Ensure the shared root exists before the provider starts syncing. Yjs warns when
    // collaborative types are accessed prior to being attached to a document, and
    // Lexical expects the `root` XmlText to always be present.
    doc.get('root', Y.XmlText);

    const endpoints = resolveEndpoints(id);

    const authEndpoint = async () => {
      await ensureDocInitialized(id, endpoints.create);

      const requestAuth = async () => {
        const response = await fetch(endpoints.auth, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ docId: id }),
        });
        return response;
      };

      let response = await requestAuth();
      if (response.status === 404) {
        await ensureDocInitialized(id, endpoints.create);
        response = await requestAuth();
      }

      if (!response.ok) {
        throw new Error(`Failed to auth doc ${id}: ${response.status} ${response.statusText}`);
      }

      const token = (await response.json()) as ClientToken;
      return rewriteTokenHost(token);
    };

    const provider = createYjsProvider(doc, id, authEndpoint, {
      connect: false,
      showDebuggerLink: false,
    });
    let destroyed = false;

    void ensureDocInitialized(id, endpoints.create).catch(() => {});

    // Let Lexical trigger connects, but ensure doc exists and tokens are host-correct first.
    const originalConnect = provider.connect.bind(provider);
    let initPromise: Promise<void> | null = null;
    provider.connect = async () => {
      if (destroyed) {
        return;
      }
      if (!initPromise) {
        initPromise = ensureDocInitialized(id, endpoints.create);
      }
      await initPromise;
      return originalConnect();
    };

    const detach = attachSyncTracking(provider, syncController, setReady);

    const originalDestroy = provider.destroy.bind(provider);
    const destroy = () => {
      if (destroyed) {
        return;
      }
      destroyed = true;
      detach();
      provider.disconnect();
      originalDestroy();
    };

    return Object.assign(provider as unknown as Provider, { destroy }) as CollaborationProviderInstance;
  };
}

function ensureDocInitialized(docId: string, createEndpoint: string): Promise<void> {
  const existing = docInitPromises.get(docId);
  if (existing) {
    return existing;
  }

  const promise = fetch(createEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ docId }),
  }).then((response) => {
    if (!response.ok) {
      throw new Error(`Failed to create doc ${docId}: ${response.status} ${response.statusText}`);
    }
  });

  docInitPromises.set(docId, promise);
  return promise;
}

function rewriteTokenHost(token: ClientToken): ClientToken {
  if (typeof location === 'undefined') {
    return token;
  }

  const { hostname } = location;
  if (hostname.length === 0) {
    return token;
  }

  const rewrite = (raw: string) => {
    const url = new URL(raw);
    if (url.hostname === '0.0.0.0' || url.hostname === 'localhost') {
      url.hostname = hostname;
    }
    return url.toString();
  };

  return {
    ...token,
    url: rewrite(token.url),
    baseUrl: rewrite(token.baseUrl),
  };
}

function attachSyncTracking(
  provider: ReturnType<typeof createYjsProvider>,
  controller: CollaborationSyncController,
  setReady: (value: boolean) => void
) {
  const handleSync = (isSynced: boolean) => {
    if (isSynced) {
      setReady(true);
      controller.setSyncing(false);
      return;
    }

    setReady(false);
    controller.setSyncing(true);
  };

  const handleLocalChanges = (hasLocalChanges: boolean) => {
    controller.setSyncing(hasLocalChanges);
  };

  const handleStatus = ({ status }: { status: string }) => {
    if (status === 'connecting' || status === 'handshaking') {
      setReady(false);
      controller.setSyncing(true);
      return;
    }

    if (status === 'connected') {
      // syncing flag will be cleared by the sync handler once the doc is synced.
      return;
    }

    // offline/error: surface as unsynced
    controller.setSyncing(true);
    setReady(false);
  };

  controller.setSyncing(true);

  provider.on('sync', handleSync);
  provider.on('status', handleStatus);
  provider.on('local-changes', handleLocalChanges);

  return () => {
    provider.off('sync', handleSync);
    provider.off('status', handleStatus);
    provider.off('local-changes', handleLocalChanges);
  };
}

export type { EndpointResolver, ResolvedEndpoints } from './endpoints';
