import { describe, expect, it } from 'vitest';
import { CODE_TTL_MS, createRegistrationCodeStore } from '#server/remdo-oauth/registration-codes';

const CREDENTIALS = { clientId: 'client-id', clientSecret: 'client-secret' };

describe('registration code store', () => {
  it('claims the stashed credentials exactly once', () => {
    const store = createRegistrationCodeStore();
    const code = store.issue(CREDENTIALS);

    expect(store.claim(code)).toEqual(CREDENTIALS);
    // Single-use: the secret cannot be pulled a second time.
    expect(store.claim(code)).toBeNull();
  });

  it('returns null for an unknown code', () => {
    const store = createRegistrationCodeStore();
    expect(store.claim('never-issued')).toBeNull();
  });

  it('is claimable just short of its TTL but expired at it (boundary is exclusive)', () => {
    // Each claim consumes, so use a separate store for each side of the boundary.
    // Both advances derive from the store's own TTL, not a re-guessed number.
    let validClock = 1000;
    const validStore = createRegistrationCodeStore(() => validClock);
    const validCode = validStore.issue(CREDENTIALS);
    validClock += CODE_TTL_MS - 1;
    expect(validStore.claim(validCode)).toEqual(CREDENTIALS);

    let expiredClock = 1000;
    const expiredStore = createRegistrationCodeStore(() => expiredClock);
    const expiredCode = expiredStore.issue(CREDENTIALS);
    // Exactly at the TTL is expired (claim checks expiresAt <= now).
    expiredClock += CODE_TTL_MS;
    expect(expiredStore.claim(expiredCode)).toBeNull();
  });

  it('consumes an expired code on the failed claim (single-use even on expiry)', () => {
    let clock = 1000;
    const store = createRegistrationCodeStore(() => clock);
    const code = store.issue(CREDENTIALS);

    clock += CODE_TTL_MS;
    // Expired → null, and the code is forgotten, so a retry cannot resurrect it
    // even if the clock were somehow rewound.
    expect(store.claim(code)).toBeNull();
    clock = 1000;
    expect(store.claim(code)).toBeNull();
  });
});
