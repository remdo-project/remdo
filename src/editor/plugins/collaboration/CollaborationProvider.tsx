import type { ReactNode } from 'react';
import { config } from '#config';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ProviderFactory } from '#lib/collaboration/runtime';
import { CollaborationSyncController, createProviderFactory } from '#lib/collaboration/runtime';

interface CollaborationStatusValue {
  ready: boolean;
  enabled: boolean;
  providerFactory: ProviderFactory;
  syncing: boolean;
  waitForSync: () => Promise<void>;
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

export function CollaborationProvider({ children }: { children: ReactNode }) {
  const value = useCollaborationRuntimeValue();

  return <CollaborationStatusContext value={value}>{children}</CollaborationStatusContext>;
}

function useCollaborationRuntimeValue(): CollaborationStatusValue {
  const enabled = config.env.COLLAB_ENABLED;
  const docId = useMemo(() => {
    const doc = globalThis.window?.location?.search
      ? new URLSearchParams(globalThis.window.location.search).get('doc')?.trim()
      : null;

    return doc?.length ? doc : config.env.COLLAB_DOCUMENT_ID;
  }, []);
  const [ready, setReady] = useState(!enabled);
  const [syncing, setSyncing] = useState(enabled);
  const endpoint = useMemo(() => {
    const { protocol, hostname } = window.location;
    const wsProtocol = protocol === 'https:' ? 'wss' : 'ws';
    return `${wsProtocol}://${hostname}:${config.env.COLLAB_CLIENT_PORT}`;
  }, []);

  const syncController = useMemo(
    () => new CollaborationSyncController(setSyncing),
    [setSyncing]
  );
  const waitersRef = useRef<Set<() => void>>(new Set());

  const flushWaiters = useCallback(() => {
    if (waitersRef.current.size === 0) {
      return;
    }

    const waiters = Array.from(waitersRef.current);
    waitersRef.current.clear();
    for (const resolve of waiters) {
      resolve();
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      syncController.setSyncing(false);
    }
  }, [enabled, syncController]);

  const providerFactory = useMemo(
    () => createProviderFactory({ setReady, syncController }, endpoint),
    [endpoint, setReady, syncController]
  );

  const resolvedReady = !enabled || ready;
  const syncingPending = enabled && syncing;

  useEffect(() => {
    if (!enabled || (resolvedReady && !syncingPending)) {
      flushWaiters();
    }
  }, [enabled, flushWaiters, resolvedReady, syncingPending]);

  const waitForSync = useCallback(() => {
    if (!enabled || (resolvedReady && !syncingPending)) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const waiters = waitersRef.current;
      const release = () => {
        waiters.delete(release);
        resolve();
      };

      waiters.add(release);
    });
  }, [enabled, resolvedReady, syncingPending]);

  return useMemo<CollaborationStatusValue>(
    () => ({
      ready: resolvedReady,
      enabled,
      providerFactory,
      syncing: syncingPending,
      waitForSync,
      docId,
    }),
    [docId, enabled, providerFactory, resolvedReady, syncingPending, waitForSync]
  );
}

export type { CollaborationStatusValue };
