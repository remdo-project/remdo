import { useEffect, useState } from 'react';
import { useCollaborationStatus } from './CollaborationProvider';
import type { CollaborationConnectionStatus } from '#lib/collaboration/runtime';

interface OfflineDocumentUnavailableSnapshot {
  enabled: boolean;
  hydrated: boolean;
  localCacheHydrated: boolean;
  connectionStatus: CollaborationConnectionStatus;
}

export function resolveOfflineDocumentUnavailable(
  snapshot: OfflineDocumentUnavailableSnapshot,
  online: boolean,
): boolean {
  const disconnected = snapshot.connectionStatus === 'disconnected' || snapshot.connectionStatus === 'error';
  return snapshot.enabled && !snapshot.hydrated && !snapshot.localCacheHydrated && disconnected && !online;
}

function readOnlineState(): boolean {
  return globalThis.navigator.onLine;
}

export function useOfflineDocumentUnavailable(): boolean {
  const { enabled, hydrated, localCacheHydrated, connectionStatus } = useCollaborationStatus();
  const [online, setOnline] = useState(readOnlineState);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
    };
    const handleOffline = () => {
      setOnline(false);
    };

    globalThis.addEventListener('online', handleOnline);
    globalThis.addEventListener('offline', handleOffline);

    return () => {
      globalThis.removeEventListener('online', handleOnline);
      globalThis.removeEventListener('offline', handleOffline);
    };
  }, []);

  return resolveOfflineDocumentUnavailable(
    {
      enabled,
      hydrated,
      localCacheHydrated,
      connectionStatus,
    },
    online,
  );
}
