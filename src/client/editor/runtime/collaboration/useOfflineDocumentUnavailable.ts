import { useCollaborationStatus } from './CollaborationProvider';
import type { CollaborationConnectionStatus } from '#collaboration/runtime';

interface OfflineDocumentUnavailableSnapshot {
  enabled: boolean;
  hydrated: boolean;
  localCacheHydrated: boolean;
  connectionStatus: CollaborationConnectionStatus;
}

// An unreachable RemDo server produces the same unusable state as a dead device
// network, so this gates on the collaboration connection alone — not
// navigator.onLine, which reports true whenever a network interface exists.
export function resolveOfflineDocumentUnavailable(
  snapshot: OfflineDocumentUnavailableSnapshot,
): boolean {
  const disconnected = snapshot.connectionStatus === 'disconnected' || snapshot.connectionStatus === 'error';
  return snapshot.enabled && !snapshot.hydrated && !snapshot.localCacheHydrated && disconnected;
}

export function useOfflineDocumentUnavailable(): boolean {
  const { enabled, hydrated, localCacheHydrated, connectionStatus } = useCollaborationStatus();

  return resolveOfflineDocumentUnavailable({
    enabled,
    hydrated,
    localCacheHydrated,
    connectionStatus,
  });
}
