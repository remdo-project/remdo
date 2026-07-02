import { describe, expect, it } from 'vitest';
import { createRegistrationHandleStore } from '#server/remdo-oauth/registration-handles';

describe('registration handle store', () => {
  it('issues a handle that consumes once for its source', () => {
    const store = createRegistrationHandleStore();
    const handle = store.issue('https-source-example');

    expect(store.consume(handle, 'https-source-example')).toBe(true);
    // single-use: a second consume fails
    expect(store.consume(handle, 'https-source-example')).toBe(false);
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

  it('rejects an expired handle', () => {
    let clock = 1000;
    const store = createRegistrationHandleStore(() => clock);
    const handle = store.issue('https-source-example');

    clock += 11 * 60 * 1000;
    expect(store.consume(handle, 'https-source-example')).toBe(false);
  });

  it('verify validates without consuming, so a later consume still succeeds', () => {
    const store = createRegistrationHandleStore();
    const handle = store.issue('https-source-example');

    expect(store.verify(handle, 'https-source-example')).toBe(true);
    // verify is non-destructive: it can be called repeatedly and the handle
    // remains usable for the eventual consume.
    expect(store.verify(handle, 'https-source-example')).toBe(true);
    expect(store.consume(handle, 'https-source-example')).toBe(true);
    expect(store.verify(handle, 'https-source-example')).toBe(false);
  });

  it('verify rejects a mismatched source and an unknown handle', () => {
    const store = createRegistrationHandleStore();
    const handle = store.issue('https-source-example');

    expect(store.verify(handle, 'https-other-example')).toBe(false);
    expect(store.verify('never-issued', 'https-source-example')).toBe(false);
  });
});
