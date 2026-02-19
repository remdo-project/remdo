import { IconCloudCheck, IconCloudX } from '@tabler/icons-react';
import type { IconComponent } from '@/ui/Icon';
import type { StatusDescriptor } from '@/editor/StatusIndicators';
import { useEffect, useState } from 'react';
import { useCollaborationStatus } from './CollaborationProvider';
import { getLocalPersistenceSupportDecision } from '#lib/collaboration/runtime';
import type { CollaborationConnectionStatus } from '#lib/collaboration/runtime';

type StatusKey = 'healthy' | 'degraded';
type LocalPersistenceState = 'enabled' | 'disabled';
type ServerState = 'connected' | 'connecting' | 'disconnected' | 'disabled';
interface IndicatorViewModel {
  localPersistence: LocalPersistenceState;
  server: ServerState;
  status: StatusKey;
}

interface CollaborationStatusSnapshot {
  enabled: boolean;
  localPersistenceSupported: boolean;
  connectionStatus: CollaborationConnectionStatus;
}

const STATUS_CONFIG: Record<StatusKey, { icon: IconComponent }> = {
  healthy: { icon: IconCloudCheck },
  degraded: { icon: IconCloudX },
};

function resolveServerState({ enabled, connectionStatus }: CollaborationStatusSnapshot): ServerState {
  if (!enabled) {
    return 'disabled';
  }
  if (connectionStatus === 'connected') {
    return 'connected';
  }
  if (connectionStatus === 'disconnected' || connectionStatus === 'error') {
    return 'disconnected';
  }
  return 'connecting';
}

function resolveLocalPersistenceState({
  enabled,
  localPersistenceSupported,
}: CollaborationStatusSnapshot): LocalPersistenceState {
  return enabled && localPersistenceSupported ? 'enabled' : 'disabled';
}

export function resolveCollaborationIndicatorStatus(snapshot: CollaborationStatusSnapshot): StatusKey {
  return buildIndicatorViewModel(snapshot).status;
}

function buildIndicatorViewModel(snapshot: CollaborationStatusSnapshot): IndicatorViewModel {
  const localPersistence = resolveLocalPersistenceState(snapshot);
  const server = resolveServerState(snapshot);
  return {
    localPersistence,
    server,
    status: localPersistence === 'enabled' && server === 'connected' ? 'healthy' : 'degraded',
  };
}

function buildStatusTitle(view: IndicatorViewModel): string {
  return `Status\nLocal persistence: ${view.localPersistence}\nServer: ${view.server}`;
}

function buildAriaLabel(view: IndicatorViewModel): string {
  return `Status. Local persistence ${view.localPersistence}. Server ${view.server}.`;
}

export function useCollaborationIndicator(): StatusDescriptor {
  const { enabled, connectionStatus } = useCollaborationStatus();
  const [localPersistenceSupported, setLocalPersistenceSupported] = useState(false);

  useEffect(() => {
    let active = true;
    void getLocalPersistenceSupportDecision().then((decision) => {
      if (!active) {
        return;
      }
      setLocalPersistenceSupported(decision.enabled);
    });
    return () => {
      active = false;
    };
  }, []);

  const snapshot = {
    enabled,
    localPersistenceSupported,
    connectionStatus,
  } satisfies CollaborationStatusSnapshot;
  const view = buildIndicatorViewModel(snapshot);
  const { icon } = STATUS_CONFIG[view.status];

  return {
    key: 'collab',
    visible: true,
    icon,
    ariaLabel: buildAriaLabel(view),
    title: buildStatusTitle(view),
    className: `collab-status collab-status--${view.status}`,
  };
}
