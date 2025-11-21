import type { ReactNode } from 'react';
import { config } from '#config';
import { createContext, use, useCallback, useMemo, useState } from 'react';
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

  const handleReady = useCallback(
    (provider: ReturnType<ProviderFactory>) => {
      if (!enabled) {
        return () => {};
      }

      let active = true;

      const arm = () => {
        if (!active) return;

        setDeferred((previous) => {
          const next = createDeferred(enabled);

          waitForProviderReady(provider)
            .then(() => {
              if (!active) return;
              previous.resolve();
              next.resolve();
            })
            .catch((error) => {
              if (!active) return;
              previous.reject(error);
              next.reject(error);
              queueMicrotask(arm);
            });

          return next;
        });
      };

      arm();

      return () => {
        active = false;
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
