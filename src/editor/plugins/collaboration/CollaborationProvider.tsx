import type { ReactNode } from 'react';
import { config } from '#config';
import { createContext, use, useCallback, useMemo, useRef } from 'react';
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

  const providerRef = useRef<ReturnType<ProviderFactory> | null>(null);
  const waitersRef = useRef<Set<{ resolve: () => void; reject: (err: Error) => void }>>(new Set());

  const awaitReady = useCallback(() => {
    if (!enabled) {
      return Promise.resolve();
    }

    const provider = providerRef.current;
    if (provider) {
      return waitForProviderReady(provider);
    }

    return new Promise<void>((resolve, reject) => {
      waitersRef.current.add({ resolve, reject });
    });
  }, [enabled]);

  const providerFactory = useMemo(
    () => {
      const factory = createProviderFactory(collabOrigin);
      return ((id: string, docMap: Map<string, Y.Doc>) => {
        const provider = factory(id, docMap);
        providerRef.current = provider;

        if (waitersRef.current.size > 0) {
          const pending = Array.from(waitersRef.current);
          waitersRef.current.clear();
          for (const waiter of pending) {
            waitForProviderReady(provider).then(waiter.resolve, waiter.reject);
          }
        }

        const destroy = provider.destroy.bind(provider);
        provider.destroy = () => {
          if (providerRef.current === provider) {
            providerRef.current = null;
          }
          if (waitersRef.current.size > 0) {
            const pending = Array.from(waitersRef.current);
            waitersRef.current.clear();
            for (const waiter of pending) {
              waiter.reject(new Error('Collaboration provider disposed'));
            }
          }
          destroy();
        };
        return provider;
      }) as ProviderFactory;
    },
    [collabOrigin]
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
