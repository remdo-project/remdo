import type { ReactNode } from 'react';
import { env } from '#config/env-client';
import { createContext, use, useMemo, useState } from 'react';
import type { ProviderFactory } from './collaborationRuntime';
import { createProviderFactory } from './collaborationRuntime';

interface CollaborationStatusValue {
  ready: boolean;
  enabled: boolean;
  providerFactory: ProviderFactory;
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
  const endpoint = useMemo(() => {
    const { protocol, hostname } = window.location;
    const wsProtocol = protocol === 'https:' ? 'wss' : 'ws';
    return `${wsProtocol}://${hostname}:${env.collabPort}`;
  }, []);

  const providerFactory = useMemo(
    () =>
      createProviderFactory(
        setReady,
        endpoint,
      ),
    [endpoint, setReady]
  );

  return useMemo<CollaborationStatusValue>(
    () => ({
      ready: !enabled || ready,
      enabled,
      providerFactory,
    }),
    [enabled, providerFactory, ready]
  );
}
