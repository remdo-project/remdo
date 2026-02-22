import { describe, expect, it } from 'vitest';
import { resolveOfflineDocumentUnavailable } from '@/editor/plugins/collaboration/useOfflineDocumentUnavailable';

describe('offline document unavailable resolution', () => {
  const base = {
    enabled: true,
    hydrated: false,
    localCacheHydrated: false,
    connectionStatus: 'disconnected' as const,
  };

  it('returns true when collaboration is enabled, offline, disconnected, and no local cache exists', () => {
    expect(resolveOfflineDocumentUnavailable(base, false)).toBe(true);
  });

  it('returns false while browser network is online', () => {
    expect(resolveOfflineDocumentUnavailable(base, true)).toBe(false);
  });

  it('returns false when local cache has hydrated', () => {
    expect(resolveOfflineDocumentUnavailable({ ...base, localCacheHydrated: true }, false)).toBe(false);
  });

  it('returns false after hydration', () => {
    expect(resolveOfflineDocumentUnavailable({ ...base, hydrated: true }, false)).toBe(false);
  });

  it('returns false when collaboration is disabled', () => {
    expect(resolveOfflineDocumentUnavailable({ ...base, enabled: false }, false)).toBe(false);
  });

  it('treats error as disconnected for offline empty-state gating', () => {
    expect(resolveOfflineDocumentUnavailable({ ...base, connectionStatus: 'error' }, false)).toBe(true);
  });
});
