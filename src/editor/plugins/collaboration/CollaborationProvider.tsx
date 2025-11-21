import type { ReactNode } from 'react';
import { config } from '#config';
import { createContext, use, useCallback, useMemo, useRef, useState } from 'react';
import type { ProviderFactory } from '#lib/collaboration/runtime';
import { createProviderFactory, waitForProviderReady } from '#lib/collaboration/runtime';
import type * as Y from 'yjs';

interface CollaborationStatusValue {
  enabled: boolean;
  providerFactory: ProviderFactory;
  awaitReady: () => Promise<void>;
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
  const enabled = config.env.COLLAB_ENABLED;
  const docId = useMemo(() => {
    const doc = globalThis.location.search ? new URLSearchParams(globalThis.location.search).get('doc')?.trim() : null;

    return doc?.length ? doc : config.env.COLLAB_DOCUMENT_ID;
  }, []);

  const [deferred, setDeferred] = useState(() => createDeferred(enabled));
  const currentDeferredRef = useRef<Deferred>(deferred);
  const pendingDeferredsRef = useRef<Deferred[]>([]);

  const handleReady = useCallback(
    (provider: ReturnType<ProviderFactory>) => {
      if (!enabled) {
        return () => {};
      }

      const eventfulProvider = provider as unknown as {
        on: (event: string, handler: (payload: unknown) => void) => void;
        off: (event: string, handler: (payload: unknown) => void) => void;
      };

      let active = true;
      let waitingFor: number | null = null;
      let generation = 0;

      const startWait = () => {
        if (!active || waitingFor === generation) return;
        const runFor = generation;
        waitingFor = runFor;

        waitForProviderReady(provider)
          .then(() => {
            if (!active || generation !== runFor) return;
            waitingFor = null;
            const current = currentDeferredRef.current;
            const deferreds = [current, ...pendingDeferredsRef.current.splice(0)];
            for (const item of deferreds) {
              item.resolve();
            }
          })
          .catch((error) => {
            if (!active || generation !== runFor) return;
            waitingFor = null;
            const current = currentDeferredRef.current;
            const deferreds = [current, ...pendingDeferredsRef.current.splice(0)];
            for (const item of deferreds) {
              item.reject(error);
            }
            queueMicrotask(startWait);
          });
      };

      const reset = () => {
        if (!active) return;
        generation += 1;
        waitingFor = null;
        setDeferred((previous) => {
          pendingDeferredsRef.current.push(previous);
          const next = createDeferred(enabled);
          currentDeferredRef.current = next;
          return next;
        });
        startWait();
      };

      const handleSync = (isSynced: unknown) => {
        if (isSynced === false) {
          reset();
        }
      };

      const handleLocalChanges = (hasLocalChanges: unknown) => {
        if (hasLocalChanges === true) {
          reset();
        }
      };

      const handleFailure = () => reset();

      reset();

      eventfulProvider.on('sync', handleSync);
      eventfulProvider.on('local-changes', handleLocalChanges);
      eventfulProvider.on('connection-close', handleFailure);
      eventfulProvider.on('connection-error', handleFailure);

      return () => {
        active = false;
        eventfulProvider.off('sync', handleSync);
        eventfulProvider.off('local-changes', handleLocalChanges);
        eventfulProvider.off('connection-close', handleFailure);
        eventfulProvider.off('connection-error', handleFailure);
      };
    },
    [enabled]
  );

  const awaitReady = useCallback(() => {
    return deferred.promise;
  }, [deferred.promise]);

  const providerFactory = useMemo(
    () => {
      const factory = createProviderFactory(collabOrigin);
      return ((id: string, docMap: Map<string, Y.Doc>) => {
        const provider = factory(id, docMap);
        const stopReady = handleReady(provider);
        const destroy = provider.destroy.bind(provider);
        provider.destroy = () => {
          stopReady();
          destroy();
        };
        return provider;
      }) as ProviderFactory;
    },
    [collabOrigin, handleReady]
  );

  return useMemo<CollaborationStatusValue>(
    () => ({
      enabled,
      providerFactory,
      awaitReady,
      docId,
    }),
    [awaitReady, docId, enabled, providerFactory]
  );
}

export type { CollaborationStatusValue };

type Deferred = ReturnType<typeof createDeferred>;

function createDeferred(enabled: boolean): { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void } {
  if (!enabled) {
    return {
      promise: Promise.resolve(),
      resolve: () => {},
      reject: () => {},
    };
  }

  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}
