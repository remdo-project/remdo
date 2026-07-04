import { describe, expect, it } from 'vitest';
import { CODE_TTL_MS, createRegistrationCodeStore } from '#server/remdo-oauth/registration-codes';

const CREDENTIALS = { clientId: 'client-id', clientSecret: 'client-secret' };
const HANDLE = 'issued-handle';

describe('registration code store', () => {
  it('claims the stashed credentials exactly once with the bound handle', () => {
    const store = createRegistrationCodeStore();
    const code = store.issue(CREDENTIALS, HANDLE);

    expect(store.claim(code, HANDLE)).toEqual(CREDENTIALS);
    // Single-use: the secret cannot be pulled a second time.
    expect(store.claim(code, HANDLE)).toBeNull();
  });

  it('rejects a claim without the bound handle (a leaked bare code cannot claim)', () => {
    const store = createRegistrationCodeStore();
    const code = store.issue(CREDENTIALS, HANDLE);

    // Wrong handle: rejected, and — critically — NOT consumed, so the legitimate
    // home (which holds the handle) can still complete.
    expect(store.claim(code, 'wrong-handle')).toBeNull();
    expect(store.claim(code, HANDLE)).toEqual(CREDENTIALS);
  });

  it('returns null for an unknown code', () => {
    const store = createRegistrationCodeStore();
    expect(store.claim('never-issued', HANDLE)).toBeNull();
  });

  it('is claimable just short of its TTL but expired at it (boundary is exclusive)', () => {
    // Each claim consumes, so use a separate store for each side of the boundary.
    // Both advances derive from the store's own TTL, not a re-guessed number.
    let validClock = 1000;
    const validStore = createRegistrationCodeStore(() => validClock);
    const validCode = validStore.issue(CREDENTIALS, HANDLE);
    validClock += CODE_TTL_MS - 1;
    expect(validStore.claim(validCode, HANDLE)).toEqual(CREDENTIALS);

    let expiredClock = 1000;
    const expiredStore = createRegistrationCodeStore(() => expiredClock);
    const expiredCode = expiredStore.issue(CREDENTIALS, HANDLE);
    // Exactly at the TTL is expired (claim checks expiresAt <= now).
    expiredClock += CODE_TTL_MS;
    expect(expiredStore.claim(expiredCode, HANDLE)).toBeNull();
  });

  it('consumes an expired code on the failed claim (single-use even on expiry)', () => {
    let clock = 1000;
    const store = createRegistrationCodeStore(() => clock);
    const code = store.issue(CREDENTIALS, HANDLE);

    clock += CODE_TTL_MS;
    // Expired → null, and the code is forgotten, so a retry cannot resurrect it
    // even if the clock were somehow rewound.
    expect(store.claim(code, HANDLE)).toBeNull();
    clock = 1000;
    expect(store.claim(code, HANDLE)).toBeNull();
  });
});
