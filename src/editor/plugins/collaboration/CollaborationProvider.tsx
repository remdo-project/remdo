import type { ReactNode } from 'react';
import { config } from '#config';
import { createContext, use, useCallback, useMemo, useRef, useState } from 'react';
import type { ProviderFactory } from '#lib/collaboration/runtime';
import { createProviderFactory, waitForProviderReady } from '#lib/collaboration/runtime';
import type * as Y from 'yjs';

interface CollaborationStatusValue {
  ready: boolean;
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

  const [ready, setReady] = useState(!enabled);
  const providerRef = useRef<ReturnType<ProviderFactory> | null>(null);
  const readyDeferredRef = useRef<{
    promise: Promise<void>;
    resolve: () => void;
    reject: (error: Error) => void;
  }>(
    enabled
      ? (() => {
          let resolve!: () => void;
          let reject!: (error: Error) => void;
          const promise = new Promise<void>((res, rej) => {
            resolve = res;
            reject = rej;
          });
          return { promise, resolve, reject };
        })()
      : { promise: Promise.resolve(), resolve: () => {}, reject: () => {} }
  );
  const readyAbortRef = useRef<AbortController | null>(null);

  const awaitReady = useCallback(() => {
    if (!enabled) {
      return Promise.resolve();
    }

    const provider = providerRef.current;
    if (provider) {
      return waitForProviderReady(provider, { signal: readyAbortRef.current?.signal });
    }

    return readyDeferredRef.current.promise;
  }, [enabled]);

  const providerFactory = useMemo(
    () => {
      const factory = createProviderFactory(collabOrigin);
      return ((id: string, docMap: Map<string, Y.Doc>) => {
        const provider = factory(id, docMap);
        providerRef.current = provider;

        setReady(false);
        const controller = new AbortController();
        readyAbortRef.current = controller;
        const deferred = readyDeferredRef.current;
        waitForProviderReady(provider, { signal: controller.signal })
          .then(() => {
            setReady(true);
            deferred.resolve();
          })
          .catch((error) => {
            if (!(error instanceof Error && error.name === 'AbortError')) {
              setReady(false);
              deferred.reject(error instanceof Error ? error : new Error(String(error)));
            }
            // Swallow abort/failure here; deferred handles propagation.
          });
        readyDeferredRef.current = deferred;

        const destroy = provider.destroy.bind(provider);
        provider.destroy = () => {
          const previousDeferred = readyDeferredRef.current;
          if (providerRef.current === provider) {
            providerRef.current = null;
            readyAbortRef.current?.abort();
            readyAbortRef.current = null;
            previousDeferred.reject(new Error('Collaboration provider disposed before ready'));
            readyDeferredRef.current =
              enabled
                ? (() => {
                    let resolve!: () => void;
                    let reject!: (error: Error) => void;
                    const promise = new Promise<void>((res, rej) => {
                      resolve = res;
                      reject = rej;
                    });
                    return { promise, resolve, reject };
                  })()
                : { promise: Promise.resolve(), resolve: () => {}, reject: () => {} };
            setReady(!enabled);
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
      ready,
      enabled,
      providerFactory,
      awaitReady,
      docId,
    }),
    [awaitReady, docId, enabled, providerFactory, ready]
  );
}

export type { CollaborationStatusValue };
