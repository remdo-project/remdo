import type { ReactNode } from 'react';
import { config } from '#config';
import { createContext, use, useCallback, useMemo, useState } from 'react';
import type { ProviderFactory } from '#lib/collaboration/runtime';
import { createProviderFactory } from '#lib/collaboration/runtime';

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

  const [deferred] = useState(() => createDeferred(enabled));

  const awaitReady = useCallback(() => {
    return deferred.promise;
  }, [deferred.promise]);

  const providerFactory = useMemo(
    () =>
      createProviderFactory(
        {
          onReady: (promise) => {
            promise.then(deferred.resolve).catch(deferred.reject);
          },
          onReadyError: deferred.reject,
        },
        collabOrigin
      ),
    [collabOrigin, deferred]
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
