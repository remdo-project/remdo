import type { ReactNode } from 'react';
import { config } from '#config';
import { createContext, use, useCallback, useMemo, useRef, useState } from 'react';
import type { MinimalProviderEvents, ProviderFactory } from '#lib/collaboration/runtime';
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
  const envOrigin = typeof config.env.COLLAB_ORIGIN === 'string' && config.env.COLLAB_ORIGIN.length > 0
    ? config.env.COLLAB_ORIGIN
    : undefined;
  const resolvedCollabOrigin =
    collabOrigin
    ?? envOrigin
    ?? location.origin;
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
  const awaitSyncedRef = useRef<{ promise: Promise<void>; abort: (cause?: Error) => void }>({
    promise: Promise.resolve(),
    abort: () => {},
  });
  const cleanupRef = useRef<(() => void) | null>(null);

  const setHydratedState = useCallback((value: boolean) => {
    hydratedRef.current = value;
    setHydrated(value);
  }, []);

  const resetAwaitSynced = useCallback(
    (
      provider?: MinimalProviderEvents | null,
      { reason, abortExisting = false }: { reason?: Error; abortExisting?: boolean } = {}
    ) => {
      if (abortExisting) {
        awaitSyncedRef.current.abort(reason);
      }

      if (!enabled) {
        awaitSyncedRef.current = { promise: Promise.resolve(), abort: () => {} };
        return;
      }

      if (!provider) {
        const promise = Promise.reject(reason ?? new Error('Collaboration provider unavailable'));
        promise.catch(() => {});
        awaitSyncedRef.current = { promise, abort: () => {} };
        return;
      }

      const controller = new AbortController();
      const promise = waitForSync(provider, {
        signal: controller.signal,
        timeoutMs: null, // explicit no-timeout for UI awaitSynced
      });
      promise.catch(() => {});
      awaitSyncedRef.current = {
        promise,
        abort: (cause?: Error) => controller.abort(cause ?? reason ?? new Error('awaitSynced reset')),
      };
    },
    [enabled]
  );

  const awaitSynced = useCallback(() => {
    if (!enabled) {
      return Promise.resolve();
    }

    const promise = awaitSyncedRef.current.promise;
    promise.catch(() => {});
    return promise;
  }, [enabled]);

  const providerFactory = useMemo(
    () => {
      const factory = createProviderFactory(resolvedCollabOrigin);
      const startProviderWatchers = (provider: ReturnType<typeof factory>) => {
        cleanupRef.current?.();

        const events = provider as unknown as MinimalProviderEvents;

        const updateState = () => {
          const nextHydrated = hydratedRef.current || events.synced === true;
          const nextSynced = nextHydrated && events.synced === true && events.hasLocalChanges !== true;

          // Re-arm awaitSynced when leaving the synced state (e.g., new local edits).
          if (syncedRef.current && !nextSynced) resetAwaitSynced(events);

        setHydratedState(nextHydrated);
          setSynced(nextSynced);
          syncedRef.current = nextSynced;
          if (nextSynced) resetAwaitSynced(events);
        };

        const handleError = (error: unknown) => {
          const provider = providerRef.current as unknown as MinimalProviderEvents | null;
          resetAwaitSynced(provider, { reason: error instanceof Error ? error : new Error(String(error)), abortExisting: true });
          setHydratedState(hydratedRef.current);
          setSynced(false);
          syncedRef.current = false;
        };

        events.on('sync', updateState);
        events.on('local-changes', updateState);
        events.on('connection-close', handleError);
        events.on('connection-error', handleError);

        // Run once in case the provider was already ready when attached.
        resetAwaitSynced(events);
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
        resetAwaitSynced(provider as unknown as MinimalProviderEvents, { abortExisting: true });
        startProviderWatchers(provider);

        const destroy = provider.destroy.bind(provider);
        provider.destroy = () => {
          if (providerRef.current === provider) {
            providerRef.current = null;
            cleanupRef.current?.();
            cleanupRef.current = null;
            resetAwaitSynced(null, { reason: new Error('Collaboration provider disposed before ready'), abortExisting: true });
            hydratedRef.current = !enabled;
            setHydrated(!enabled);
            setSynced(!enabled);
            syncedRef.current = !enabled;
          }
          destroy();
        };
        return provider;
      }) as ProviderFactory;
    },
    [resolvedCollabOrigin, enabled, resetAwaitSynced, setHydratedState]
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
