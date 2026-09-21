import { describe, expect, it } from 'vitest';

import type { CollaborationConnectionStatus, LocalPersistenceStatus } from '#collaboration/runtime';
import { buildCollaborationIndicatorViewModel } from '#client/editor/runtime/collaboration/useCollaborationIndicator';

function resolveView({
  enabled = true,
  localPersistenceStatus = 'enabled',
  connectionStatus = 'connected',
  hasLocalChanges = false,
}: {
  enabled?: boolean;
  localPersistenceStatus?: LocalPersistenceStatus;
  connectionStatus?: CollaborationConnectionStatus;
  hasLocalChanges?: boolean;
}) {
  return buildCollaborationIndicatorViewModel({
    enabled,
    localPersistenceStatus,
    connectionStatus,
    hasLocalChanges,
  });
}

function resolveStatus(options: Parameters<typeof resolveView>[0]) {
  return resolveView(options).status;
}

describe('collaboration indicator status mapping', () => {
  it('returns degraded when collaboration is disabled', () => {
    expect(resolveStatus({ enabled: false })).toBe('degraded');
  });

  it('returns healthy only when server is connected and local persistence is enabled', () => {
    expect(resolveStatus({ enabled: true, localPersistenceStatus: 'enabled', connectionStatus: 'connected' })).toBe('healthy');
  });

  it('returns degraded when local persistence is disabled', () => {
    expect(resolveStatus({ enabled: true, localPersistenceStatus: 'disabled', connectionStatus: 'connected' })).toBe('degraded');
  });

  it('reports a failed cache while server synchronization remains connected', () => {
    const view = resolveView({ localPersistenceStatus: 'error', connectionStatus: 'connected' });
    expect(view.localPersistence).toBe('error');
    expect(view.server).toBe('connected');
    expect(view.status).toBe('degraded');
    expect(view.unsaved).toBe(false);
  });

  it('returns degraded while server is connecting', () => {
    expect(resolveStatus({ enabled: true, localPersistenceStatus: 'enabled', connectionStatus: 'connecting' })).toBe('degraded');
  });

  it('returns degraded when server is disconnected', () => {
    expect(resolveStatus({ enabled: true, localPersistenceStatus: 'enabled', connectionStatus: 'disconnected' })).toBe('degraded');
    expect(resolveStatus({ enabled: true, localPersistenceStatus: 'enabled', connectionStatus: 'error' })).toBe('degraded');
    expect(resolveStatus({ enabled: true, localPersistenceStatus: 'enabled', connectionStatus: 'handshaking' })).toBe('degraded');
  });
});

describe('collaboration indicator save state', () => {
  it('reports nothing unsaved while disconnected with every edit acknowledged', () => {
    // Being offline is not unsaved work; claiming it is trains readers to
    // ignore the one message that means their edits are at risk.
    const view = resolveView({ connectionStatus: 'disconnected', hasLocalChanges: false });

    expect(view.unsaved).toBe(false);
    expect(view.unsavedOffline).toBe(false);
  });

  it('reports unsaved work that cannot reach a disconnected server', () => {
    const view = resolveView({ connectionStatus: 'disconnected', hasLocalChanges: true });

    expect(view.unsaved).toBe(true);
    expect(view.unsavedOffline).toBe(true);
  });

  it('reports unsaved work while the server is still reachable', () => {
    // An edit in flight on a healthy connection is the case a connectivity
    // check misses entirely.
    const view = resolveView({ connectionStatus: 'connected', hasLocalChanges: true });

    expect(view.unsaved).toBe(true);
    expect(view.unsavedOffline).toBe(false);
  });

  it('reports nothing unsaved when collaboration is disabled', () => {
    expect(resolveView({ enabled: false, hasLocalChanges: true }).unsaved).toBe(false);
  });
});
