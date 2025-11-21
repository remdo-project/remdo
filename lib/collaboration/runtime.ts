import type { Provider } from '@lexical/yjs';
import { createYjsProvider } from '@y-sweet/client';
import type { ClientToken } from '@y-sweet/sdk';
import * as Y from 'yjs';

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
const docAuthInFlight = new Map<string, Promise<ClientToken>>();

export function createProviderFactory(
  { setReady, syncController }: ProviderFactorySignals,
  origin?: string
): ProviderFactory {
  const resolveEndpoints = createEndpointResolver(origin);

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
      const token = await getAuthToken(id, endpoints);
      return rewriteTokenHost(token);
    };

    const provider = createYjsProvider(doc, id, authEndpoint, {
      connect: false,
      showDebuggerLink: false,
    });
    let destroyed = false;

    const detach = attachSyncTracking(provider, syncController, setReady);

    const originalDestroy = provider.destroy.bind(provider);
    const destroy = () => {
      if (destroyed) {
        return;
      }
      destroyed = true;
      // Prevent the provider from scheduling reconnections after teardown, which can
      // otherwise keep Node processes (e.g., snapshot CLI) alive.
      provider.connect = () => Promise.resolve();
      detach();
      provider.disconnect();
      originalDestroy();
    };

    return Object.assign(provider as unknown as Provider, { destroy }) as CollaborationProviderInstance;
  };
}

function createEndpointResolver(origin?: string) {
  const basePath = '/doc';
  const normalizedOrigin = origin ? origin.replace(/\/$/, '') : '';
  const base = normalizedOrigin ? `${normalizedOrigin}${basePath}` : basePath;

  return (docId: string) => {
    const encodedId = encodeURIComponent(docId);
    return {
      auth: `${base}/${encodedId}/auth`,
      create: `${base}/new`,
    };
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
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to create doc ${docId}: ${response.status} ${response.statusText}`);
      }
    })
    .catch((error) => {
      docInitPromises.delete(docId);
      throw error;
    });

  docInitPromises.set(docId, promise);
  return promise;
}

function getAuthToken(docId: string, endpoints: { auth: string; create: string }): Promise<ClientToken> {
  const existing = docAuthInFlight.get(docId);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    await ensureDocInitialized(docId, endpoints.create);

    const requestAuth = async () =>
      fetch(endpoints.auth, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ docId }),
      });

    let response = await requestAuth();
    if (response.status === 404) {
      // If the server dropped the doc, ensure we re-run creation instead of reusing
      // the successful cached init promise.
      docInitPromises.delete(docId);
      await ensureDocInitialized(docId, endpoints.create);
      response = await requestAuth();
    }

    if (!response.ok) {
      throw new Error(`Failed to auth doc ${docId}: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as ClientToken;
  })();

  docAuthInFlight.set(docId, promise);
  return promise.finally(() => {
    docAuthInFlight.delete(docId);
  });
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
