import { describe, expect, it } from 'vitest';

import type { CollaborationConnectionStatus } from '#lib/collaboration/runtime';
import { resolveCollaborationIndicatorStatus } from '@/editor/plugins/collaboration/useCollaborationIndicator';

function resolveStatus({
  enabled = true,
  localPersistenceSupported = true,
  connectionStatus = 'connected',
}: {
  enabled?: boolean;
  localPersistenceSupported?: boolean;
  connectionStatus?: CollaborationConnectionStatus;
}) {
  return resolveCollaborationIndicatorStatus({
    enabled,
    localPersistenceSupported,
    connectionStatus,
  });
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
