import { useCollaborationStatus } from './CollaborationProvider';
import type { CollaborationConnectionStatus } from '#collaboration/runtime';
import { useOnlineState } from '#client/runtime/useOnlineState';

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

export function useOfflineDocumentUnavailable(): boolean {
  const { enabled, hydrated, localCacheHydrated, connectionStatus } = useCollaborationStatus();
  const online = useOnlineState();

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
