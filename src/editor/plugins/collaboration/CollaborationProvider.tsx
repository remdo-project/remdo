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

interface MinimalProviderEvents {
  on: (event: string, handler: (payload: unknown) => void) => void;
  off: (event: string, handler: (payload: unknown) => void) => void;
  synced?: boolean;
  hasLocalChanges?: boolean;
}

const missingContextError = new Error('Collaboration context is missing. Wrap the editor in <CollaborationProvider>.');

const CollaborationStatusContext = createContext<CollaborationStatusValue | null>(null);

interface AwaitSyncedState {
  provider: MinimalProviderEvents | null;
  controller: AbortController | null;
  promise: Promise<void>;
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
  const syncedRef = useRef(synced);
  const providerRef = useRef<ReturnType<ProviderFactory> | null>(null);
  const awaitSyncedRef = useRef<AwaitSyncedState | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  if (awaitSyncedRef.current === null) {
    const initialPromise = enabled
      ? Promise.reject(new Error('Collaboration provider unavailable'))
      : Promise.resolve();
    initialPromise.catch(() => {});
    awaitSyncedRef.current = { provider: null, controller: null, promise: initialPromise };
  }

  const setHydratedState = useCallback((value: boolean) => {
    hydratedRef.current = value;
    setHydrated(value);
  }, []);

  const armAwaitSynced = useCallback(
    (provider: MinimalProviderEvents | null, reason?: Error) => {
      const previous = awaitSyncedRef.current;
      if (previous?.controller) {
        previous.controller.abort(reason ?? new Error('Collaboration sync reset'));
      }

      if (!enabled) {
        const resolved = Promise.resolve();
        resolved.catch(() => {});
        awaitSyncedRef.current = { provider: null, controller: null, promise: resolved };
        return resolved;
      }

      if (!provider) {
        const rejected = Promise.reject(reason ?? new Error('Collaboration provider unavailable'));
        rejected.catch(() => {});
        awaitSyncedRef.current = { provider: null, controller: null, promise: rejected };
        return rejected;
      }

      const controller = new AbortController();
      const promise = waitForSync(provider, { signal: controller.signal });
      promise.catch(() => {});
      awaitSyncedRef.current = { provider, controller, promise };
      return promise;
    },
    [enabled]
  );

  const resetDeferredAndFlags = useCallback(
    (reason: Error, hydratedValue: boolean, syncedValue: boolean, provider: MinimalProviderEvents | null) => {
      void armAwaitSynced(provider, reason);
      hydratedRef.current = hydratedValue;
      setHydrated(hydratedValue);
      setSynced(syncedValue);
      syncedRef.current = syncedValue;
    },
    [armAwaitSynced]
  );

  const awaitSynced = useCallback(() => {
    if (!enabled) {
      return Promise.resolve();
    }

    const provider = providerRef.current as unknown as MinimalProviderEvents | null;
    if (!provider) {
      return armAwaitSynced(null, new Error('Collaboration provider unavailable'));
    }

    const current = awaitSyncedRef.current;
    if (current?.provider === provider) {
      current.promise.catch(() => {});
      return current.promise;
    }

    return armAwaitSynced(provider);
  }, [armAwaitSynced, enabled]);

  const providerFactory = useMemo(
    () => {
      const factory = createProviderFactory(collabOrigin);
      const startProviderWatchers = (provider: ReturnType<typeof factory>) => {
        cleanupRef.current?.();

        const events = provider as unknown as MinimalProviderEvents;

        const updateState = () => {
          const nextHydrated = hydratedRef.current || events.synced === true;
          const nextSynced = nextHydrated && events.synced === true && events.hasLocalChanges !== true;

          // Re-arm awaitSynced when leaving the synced state (e.g., new local edits).
          if (syncedRef.current && !nextSynced) {
            void armAwaitSynced(events);
          }

          setHydratedState(nextHydrated);
          setSynced(nextSynced);
          syncedRef.current = nextSynced;
        };

        const handleError = (error: unknown) => {
          resetDeferredAndFlags(
            error instanceof Error ? error : new Error(String(error)),
            hydratedRef.current,
            false,
            events
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
        syncedRef.current = false;
        setDocEpoch((epoch) => epoch + 1);
        void armAwaitSynced(provider as unknown as MinimalProviderEvents);
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
              !enabled,
              null
            );
          }
          destroy();
        };
        return provider;
      }) as ProviderFactory;
    },
    [armAwaitSynced, collabOrigin, enabled, resetDeferredAndFlags, setHydratedState]
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
