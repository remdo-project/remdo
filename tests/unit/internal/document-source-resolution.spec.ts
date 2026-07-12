import { describe, expect, it } from 'vitest';
import { resolveDocumentSourcePending } from '#client/app/routes/document/useDocumentSourceResolution';

describe('document source resolution pending gate', () => {
  const base = {
    online: true,
    documentSourcesLoading: true,
    localDocumentExists: false,
    hasCurrentSource: false,
    probeState: 'probing' as const,
  };

  it('is pending while the source is ambiguous and the local-access probe is in flight', () => {
    expect(resolveDocumentSourcePending(base)).toBe(true);
  });

  it('stops pending once the probe settles as authorized', () => {
    expect(resolveDocumentSourcePending({ ...base, probeState: 'authorized' })).toBe(false);
  });

  it('stops pending once the probe settles as unavailable (server error / denied)', () => {
    // A failed sync-token probe must not trap the workspace on "Loading
    // document"; mount the editor and let the collaboration layer surface the
    // connection-unavailable state.
    expect(resolveDocumentSourcePending({ ...base, probeState: 'unavailable' })).toBe(false);
  });

  it('is not pending when the browser is offline (no probe runs)', () => {
    expect(resolveDocumentSourcePending({ ...base, online: false })).toBe(false);
  });

  it('is not pending when a local copy already exists', () => {
    expect(resolveDocumentSourcePending({ ...base, localDocumentExists: true })).toBe(false);
  });

  it('is not pending when the document resolves to a known source', () => {
    expect(resolveDocumentSourcePending({ ...base, hasCurrentSource: true })).toBe(false);
  });

  it('is not pending once document sources finish loading', () => {
    expect(resolveDocumentSourcePending({ ...base, documentSourcesLoading: false })).toBe(false);
  });
});
