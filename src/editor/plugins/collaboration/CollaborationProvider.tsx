import type { ReactNode } from 'react';
import { config } from '#config';
import { createContext, use, useCallback, useMemo, useRef, useState } from 'react';
import type { ProviderFactory } from '#lib/collaboration/runtime';
import { createProviderFactory } from '#lib/collaboration/runtime';
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

interface MinimalProviderEvents {
  on: (event: any, handler: (payload: any) => void) => void;
  off: (event: any, handler: (payload: any) => void) => void;
  synced?: boolean;
  hasLocalChanges?: boolean;
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
  const hydratedRef = useRef(hydrated);
  const providerRef = useRef<ReturnType<ProviderFactory> | null>(null);
  const syncedDeferredRef = useRef(createSyncedDeferred(enabled));
  const cleanupRef = useRef<(() => void) | null>(null);

  const setHydratedState = useCallback((value: boolean) => {
    hydratedRef.current = value;
    setHydrated(value);
  }, []);

  const resetDeferredAndFlags = useCallback(
    (reason: Error, hydratedValue: boolean, syncedValue: boolean) => {
      const previousSyncedDeferred = syncedDeferredRef.current;
      previousSyncedDeferred.reject(reason);
      syncedDeferredRef.current = createSyncedDeferred(enabled);
      hydratedRef.current = hydratedValue;
      setHydrated(hydratedValue);
      setSynced(syncedValue);
    },
    [enabled]
  );

  const awaitSynced = useCallback(() => {
    if (!enabled) {
      return Promise.resolve();
    }

    const promise = syncedDeferredRef.current.promise;
    promise.catch(() => {});
    return promise;
  }, [enabled]);

  const providerFactory = useMemo(
    () => {
      const factory = createProviderFactory(collabOrigin);
      const startProviderWatchers = (provider: ReturnType<typeof factory>) => {
        cleanupRef.current?.();

        const events = provider as unknown as MinimalProviderEvents;

        const updateState = () => {
          const nextHydrated = hydratedRef.current || events.synced === true;
          const nextSynced = nextHydrated && events.synced === true && events.hasLocalChanges !== true;
          setHydratedState(nextHydrated);
          setSynced(nextSynced);
          if (nextSynced) {
            syncedDeferredRef.current.resolve();
          }
        };

        const handleError = (error: unknown) => {
          resetDeferredAndFlags(
            error instanceof Error ? error : new Error(String(error)),
            hydratedRef.current,
            false
          );
        };

        events.on('sync', updateState);
        events.on('local-changes', updateState);
        events.on('connection-close', handleError);
        events.on('connection-error', handleError);

        // Run once in case the provider was already ready when attached.
        updateState();

        cleanupRef.current = () => {
          events.off('sync', updateState);
          events.off('local-changes', updateState);
          events.off('connection-close', handleError);
          events.off('connection-error', handleError);
        };
      };

      return ((id: string, docMap: Map<string, Y.Doc>) => {
        const provider = factory(id, docMap);
        providerRef.current = provider;

        hydratedRef.current = false;
        setHydrated(false);
        setSynced(false);
        setDocEpoch((epoch) => epoch + 1);
        syncedDeferredRef.current = createSyncedDeferred(enabled);
        startProviderWatchers(provider);

        const destroy = provider.destroy.bind(provider);
        provider.destroy = () => {
          if (providerRef.current === provider) {
            providerRef.current = null;
            cleanupRef.current?.();
            cleanupRef.current = null;
            resetDeferredAndFlags(
              new Error('Collaboration provider disposed before ready'),
              !enabled,
              !enabled
            );
          }
          destroy();
        };
        return provider;
      }) as ProviderFactory;
    },
    [collabOrigin, enabled, resetDeferredAndFlags, setHydratedState]
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
