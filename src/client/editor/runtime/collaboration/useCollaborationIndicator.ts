import { IconCloudCheck, IconCloudX } from '@tabler/icons-react';
import type { IconComponent } from '#client/ui/Icon';
import type { StatusDescriptor } from '#client/editor/foundation/status-descriptor';
import { useEffect, useState } from 'react';
import { useCollaborationStatus } from './CollaborationProvider';
import { getLocalPersistenceSupportDecision } from '#collaboration/runtime';
import type { CollaborationConnectionStatus } from '#collaboration/runtime';

type StatusKey = 'healthy' | 'degraded';
type LocalPersistenceState = 'enabled' | 'disabled';
type ServerState = 'connected' | 'connecting' | 'disconnected' | 'disabled';
interface IndicatorViewModel {
  localPersistence: LocalPersistenceState;
  server: ServerState;
  status: StatusKey;
  /** Edits exist that the server has not acknowledged. */
  unsaved: boolean;
  /** Those edits cannot reach the server until it is reachable again. */
  unsavedOffline: boolean;
}

interface CollaborationStatusSnapshot {
  enabled: boolean;
  localPersistenceSupported: boolean;
  connectionStatus: CollaborationConnectionStatus;
  /** Edits the server has not acknowledged; a disconnect alone does not set it. */
  hasLocalChanges: boolean;
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

export function buildCollaborationIndicatorViewModel(snapshot: CollaborationStatusSnapshot): IndicatorViewModel {
  const localPersistence = resolveLocalPersistenceState(snapshot);
  const server = resolveServerState(snapshot);
  // A disconnect alone is not unsaved work: the question a reader is asking is
  // whether their edits are safe, not whether a socket is open.
  const unsaved = snapshot.enabled && snapshot.hasLocalChanges;
  return {
    localPersistence,
    server,
    status: localPersistence === 'enabled' && server === 'connected' ? 'healthy' : 'degraded',
    unsaved,
    unsavedOffline: unsaved && server === 'disconnected',
  };
}

function describeSaveState(view: IndicatorViewModel): string {
  if (view.unsavedOffline) {
    return 'Unsaved changes, waiting to reconnect';
  }
  return view.unsaved ? 'Saving' : 'Saved to server';
}

function buildStatusTitle(view: IndicatorViewModel): string {
  return `Status\n${describeSaveState(view)}\nLocal persistence: ${view.localPersistence}\nServer: ${view.server}`;
}

function buildAriaLabel(view: IndicatorViewModel): string {
  return `Status. ${describeSaveState(view)}. Local persistence ${view.localPersistence}. Server ${view.server}.`;
}

export function useCollaborationIndicator(): StatusDescriptor {
  const { enabled, connectionStatus, hasLocalChanges } = useCollaborationStatus();
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
    hasLocalChanges,
  } satisfies CollaborationStatusSnapshot;
  const view = buildCollaborationIndicatorViewModel(snapshot);
  const { icon } = STATUS_CONFIG[view.status];
  const classNames = [
    'collab-status',
    `collab-status--${view.status}`,
    view.unsavedOffline && 'collab-status--interrupted',
  ].filter(Boolean).join(' ');

  return {
    key: 'collab',
    visible: true,
    icon,
    ariaLabel: buildAriaLabel(view),
    title: buildStatusTitle(view),
    text: view.unsavedOffline ? 'Unsaved · syncs when reconnected' : undefined,
    className: classNames,
  };
}
