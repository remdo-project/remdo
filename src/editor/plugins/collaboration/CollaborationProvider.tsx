import type { ReactNode } from 'react';
import { config } from '#config';
import { createContext, use, useCallback, useMemo, useRef, useState } from 'react';
import type { ProviderFactory } from '#lib/collaboration/runtime';
import { createProviderFactory, waitForSync } from '#lib/collaboration/runtime';
import type * as Y from 'yjs';

interface CollaborationStatusValue {
  /**
   * hydrated: first remote snapshot has been received for the current doc (initial `sync` fired).
   * synced: hydrated AND provider.hasLocalChanges === false (all local edits flushed).
   * docEpoch: increments whenever a new provider/doc starts loading; use to re-arm effects that
   * should reset on doc switch (e.g., RootSchemaPlugin).
   * awaitSynced(): waits for the synced state (includes local-change drain).
   */
  hydrated: boolean;
  synced: boolean;
  docEpoch: number;
  enabled: boolean;
  providerFactory: ProviderFactory;
  awaitSynced: () => Promise<void>;
  docId: string;
}

const missingContextError = new Error('Collaboration context is missing. Wrap the editor in <CollaborationProvider>.');

const CollaborationStatusContext = createContext<CollaborationStatusValue | null>(null);

function createSyncedDeferred(enabled: boolean) {
  if (!enabled) {
    return { promise: Promise.resolve(), resolve: () => {}, reject: () => {} };
  }

  let resolve!: () => void;
  let reject!: (error: Error) => void;

  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  // Attach a handler so rejections from unused deferreds do not surface as unhandled.
  promise.catch(() => {});

  return { promise, resolve, reject };
}

// eslint-disable-next-line react-refresh/only-export-components -- Safe: hook reads context without holding component state.
export function useCollaborationStatus(): CollaborationStatusValue {
  const value = use(CollaborationStatusContext);

  if (!value) {
    throw missingContextError;
  }

  return value;
}

export function CollaborationProvider({
  children,
  collabOrigin,
}: {
  children: ReactNode;
  collabOrigin?: string;
}) {
  const value = useCollaborationRuntimeValue({ collabOrigin });

  return <CollaborationStatusContext value={value}>{children}</CollaborationStatusContext>;
}

function useCollaborationRuntimeValue({ collabOrigin }: { collabOrigin?: string }): CollaborationStatusValue {
  const enabled = config.env.COLLAB_ENABLED;
  const docId = useMemo(() => {
    const doc = globalThis.location.search ? new URLSearchParams(globalThis.location.search).get('doc')?.trim() : null;

    return doc?.length ? doc : config.env.COLLAB_DOCUMENT_ID;
  }, []);

  const [hydrated, setHydrated] = useState(!enabled);
  const [synced, setSynced] = useState(!enabled);
  const [docEpoch, setDocEpoch] = useState(0);
  const providerRef = useRef<ReturnType<ProviderFactory> | null>(null);
  const syncedDeferredRef = useRef(createSyncedDeferred(enabled));
  const readyAbortRef = useRef<AbortController | null>(null);

  const awaitSynced = useCallback(() => {
    if (!enabled) {
      return Promise.resolve();
    }

    const provider = providerRef.current;
    const promise =
      provider
        ? waitForSync(provider, { signal: readyAbortRef.current?.signal, drainLocalChanges: true })
        : syncedDeferredRef.current.promise;

    promise.catch(() => {});
    return promise;
  }, [enabled]);

  const providerFactory = useMemo(
    () => {
      const factory = createProviderFactory(collabOrigin);
      const startProviderReadyWatch = (provider: ReturnType<typeof factory>) => {
        const controller = new AbortController();
        readyAbortRef.current = controller;
        const syncedDeferred = syncedDeferredRef.current;

        const watch = async () => {
          try {
            await waitForSync(provider, { signal: controller.signal, drainLocalChanges: false });
            setHydrated(true);

            await waitForSync(provider, { signal: controller.signal, drainLocalChanges: true });
            setSynced(true);
            syncedDeferred.resolve();
          } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
              return;
            }

            setHydrated(false);
            setSynced(false);
            syncedDeferred.reject(error instanceof Error ? error : new Error(String(error)));

            if (providerRef.current === provider) {
              syncedDeferredRef.current = createSyncedDeferred(enabled);
              startProviderReadyWatch(provider);
            }
          }
        };

        // Fire-and-forget: watcher manages its own errors/retries and we must not block render.
        void watch();
      };

      return ((id: string, docMap: Map<string, Y.Doc>) => {
        const provider = factory(id, docMap);
        providerRef.current = provider;

        setHydrated(false);
        setSynced(false);
        setDocEpoch((epoch) => epoch + 1);
        syncedDeferredRef.current = createSyncedDeferred(enabled);
        startProviderReadyWatch(provider);

        const destroy = provider.destroy.bind(provider);
        provider.destroy = () => {
          const previousSyncedDeferred = syncedDeferredRef.current;
          if (providerRef.current === provider) {
            providerRef.current = null;
            readyAbortRef.current?.abort();
            readyAbortRef.current = null;
            previousSyncedDeferred.reject(new Error('Collaboration provider disposed before ready'));
            syncedDeferredRef.current = createSyncedDeferred(enabled);
            setHydrated(!enabled);
            setSynced(!enabled);
          }
          destroy();
        };
        return provider;
      }) as ProviderFactory;
    },
    [collabOrigin, enabled]
  );

  return useMemo<CollaborationStatusValue>(
    () => ({
      hydrated,
      synced,
      docEpoch,
      enabled,
      providerFactory,
      awaitSynced,
      docId,
    }),
    [awaitSynced, docEpoch, docId, enabled, providerFactory, hydrated, synced]
  );
}

export type { CollaborationStatusValue };
