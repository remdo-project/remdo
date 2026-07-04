import { describe, expect, it } from 'vitest';
import { HANDLE_TTL_MS, createRegistrationHandleStore } from '#server/remdo-oauth/registration-handles';

describe('registration handle store', () => {
  it('issues a handle that consumes once for its source', () => {
    const store = createRegistrationHandleStore();
    const handle = store.issue('https-source-example');

    expect(store.consume(handle, 'https-source-example')).toBe(true);
    // single-use: a second consume fails
    expect(store.consume(handle, 'https-source-example')).toBe(false);
  });

  it('re-issuing for a source supersedes the prior handle (one in-flight per source)', () => {
    const store = createRegistrationHandleStore();
    const first = store.issue('https-source-example');
    const second = store.issue('https-source-example');

    // findBySource must recover the LATEST handle — the one the source bound the
    // new code to — so a retry does not wedge on a stale handle.
    expect(store.findBySource('https-source-example')).toBe(second);
    // The superseded handle is gone.
    expect(store.consume(first, 'https-source-example')).toBe(false);
    expect(store.consume(second, 'https-source-example')).toBe(true);
  });

  it('rejects a handle presented for a different source', () => {
    const store = createRegistrationHandleStore();
    const handle = store.issue('https-source-example');

    expect(store.consume(handle, 'https-other-example')).toBe(false);
    // binding mismatch must not consume it for its real source either
    expect(store.consume(handle, 'https-source-example')).toBe(true);
  });

  it('rejects an unknown handle', () => {
    const store = createRegistrationHandleStore();
    expect(store.consume('never-issued', 'https-source-example')).toBe(false);
  });

  it('rejects a handle at its TTL boundary (expiry is exclusive)', () => {
    let clock = 1000;
    const store = createRegistrationHandleStore(() => clock);
    const handle = store.issue('https-source-example');

    // Just short of the TTL: still recoverable (non-destructive check).
    clock += HANDLE_TTL_MS - 1;
    expect(store.findBySource('https-source-example')).toBe(handle);
    // Exactly at the TTL: expired (consume checks expiresAt > now, so the
    // boundary is exclusive). Derived from the store's own TTL, not a re-guessed
    // number, so this tracks the constant automatically.
    clock += 1;
    expect(store.consume(handle, 'https-source-example')).toBe(false);
  });

  it('consume rejects a mismatched source and an unknown handle', () => {
    const store = createRegistrationHandleStore();
    const handle = store.issue('https-source-example');

    expect(store.consume(handle, 'https-other-example')).toBe(false);
    expect(store.consume('never-issued', 'https-source-example')).toBe(false);
    // Neither rejection consumed the handle, so it still works for its real source.
    expect(store.consume(handle, 'https-source-example')).toBe(true);
  });

  it('findBySource recovers the in-flight handle server-side, then not after consume', () => {
    const store = createRegistrationHandleStore();
    const handle = store.issue('https-source-example');

    // The home recovers its own handle by source id — the value never has to ride
    // in the browser.
    expect(store.findBySource('https-source-example')).toBe(handle);
    expect(store.findBySource('https-other-example')).toBeNull();

    store.consume(handle, 'https-source-example');
    expect(store.findBySource('https-source-example')).toBeNull();
  });

  it('findBySource ignores an expired handle', () => {
    let clock = 1000;
    const store = createRegistrationHandleStore(() => clock);
    store.issue('https-source-example');

    clock += HANDLE_TTL_MS;
    expect(store.findBySource('https-source-example')).toBeNull();
  });
});
