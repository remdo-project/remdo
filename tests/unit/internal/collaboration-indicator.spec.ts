import { describe, expect, it } from 'vitest';

import type { CollaborationConnectionStatus } from '#collaboration/runtime';
import { buildCollaborationIndicatorViewModel } from '#client/editor/runtime/collaboration/useCollaborationIndicator';

function resolveView({
  enabled = true,
  localPersistenceSupported = true,
  connectionStatus = 'connected',
  hasLocalChanges = false,
}: {
  enabled?: boolean;
  localPersistenceSupported?: boolean;
  connectionStatus?: CollaborationConnectionStatus;
  hasLocalChanges?: boolean;
}) {
  return buildCollaborationIndicatorViewModel({
    enabled,
    localPersistenceSupported,
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
    expect(resolveStatus({ enabled: true, localPersistenceSupported: true, connectionStatus: 'connected' })).toBe('healthy');
  });

  it('returns degraded when local persistence is disabled', () => {
    expect(resolveStatus({ enabled: true, localPersistenceSupported: false, connectionStatus: 'connected' })).toBe('degraded');
  });

  it('returns degraded while server is connecting', () => {
    expect(resolveStatus({ enabled: true, localPersistenceSupported: true, connectionStatus: 'connecting' })).toBe('degraded');
  });

  it('returns degraded when server is disconnected', () => {
    expect(resolveStatus({ enabled: true, localPersistenceSupported: true, connectionStatus: 'disconnected' })).toBe('degraded');
    expect(resolveStatus({ enabled: true, localPersistenceSupported: true, connectionStatus: 'error' })).toBe('degraded');
    expect(resolveStatus({ enabled: true, localPersistenceSupported: true, connectionStatus: 'handshaking' })).toBe('degraded');
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
