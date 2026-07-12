import { describe, expect, it } from 'vitest';
import { resolveOfflineDocumentUnavailable } from '#client/editor/plugins/collaboration/useOfflineDocumentUnavailable';

describe('offline document unavailable resolution', () => {
  const base = {
    enabled: true,
    hydrated: false,
    localCacheHydrated: false,
    connectionStatus: 'disconnected' as const,
  };

  it('returns true when collaboration is enabled, disconnected, and no local cache exists', () => {
    expect(resolveOfflineDocumentUnavailable(base)).toBe(true);
  });

  it('treats a server-unreachable error the same as a disconnect', () => {
    // An unreachable RemDo server produces the same unusable state as a dead
    // device network, so gating is on the collaboration connection alone.
    expect(resolveOfflineDocumentUnavailable({ ...base, connectionStatus: 'error' })).toBe(true);
  });

  it('returns false while still connecting', () => {
    expect(resolveOfflineDocumentUnavailable({ ...base, connectionStatus: 'connecting' })).toBe(false);
  });

  it('returns false when local cache has hydrated', () => {
    expect(resolveOfflineDocumentUnavailable({ ...base, localCacheHydrated: true })).toBe(false);
  });

  it('returns false after hydration', () => {
    expect(resolveOfflineDocumentUnavailable({ ...base, hydrated: true })).toBe(false);
  });

  it('returns false when collaboration is disabled', () => {
    expect(resolveOfflineDocumentUnavailable({ ...base, enabled: false })).toBe(false);
  });
});
