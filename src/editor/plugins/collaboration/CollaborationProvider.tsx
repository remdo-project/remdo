import type { ReactNode } from 'react';
import { env } from '#config/env-client';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ProviderFactory } from './collaborationRuntime';
import { createProviderFactory } from './collaborationRuntime';

interface CollaborationStatusValue {
  ready: boolean;
  enabled: boolean;
  providerFactory: ProviderFactory;
  hasUnsyncedChanges: boolean;
  waitForSync: () => Promise<void>;
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
  const enabled = env.collabEnabled;
  const [ready, setReady] = useState(!enabled);
  const [unsynced, setUnsynced] = useState(enabled);
  const endpoint = useMemo(() => {
    const { protocol, hostname } = window.location;
    const wsProtocol = protocol === 'https:' ? 'wss' : 'ws';
    return `${wsProtocol}://${hostname}:${env.collabPort}`;
  }, []);

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

  const providerFactory = useMemo(
    () => createProviderFactory({ setReady, setUnsynced }, endpoint),
    [endpoint, setReady, setUnsynced]
  );

  const resolvedReady = !enabled || ready;
  const hasUnsyncedChanges = enabled && unsynced;

  useEffect(() => {
    if (!enabled || (resolvedReady && !hasUnsyncedChanges)) {
      flushWaiters();
    }
  }, [enabled, flushWaiters, hasUnsyncedChanges, resolvedReady]);

  const waitForSync = useCallback(() => {
    if (!enabled || (resolvedReady && !hasUnsyncedChanges)) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const waiters = waitersRef.current;
      const release = () => {
        waiters.delete(release);
        resolve();
      };

      waiters.add(release);

      if (!enabled || (resolvedReady && !hasUnsyncedChanges)) {
        release();
      }
    });
  }, [enabled, hasUnsyncedChanges, resolvedReady]);

  return useMemo<CollaborationStatusValue>(
    () => ({
      ready: resolvedReady,
      enabled,
      providerFactory,
      hasUnsyncedChanges,
      waitForSync,
    }),
    [enabled, hasUnsyncedChanges, providerFactory, resolvedReady, waitForSync]
  );
}

export type { CollaborationStatusValue };
