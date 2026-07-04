import { describe, expect, it } from 'vitest';
import {
  REGISTRATION_MAX,
  REGISTRATION_WINDOW_MS,
  createRegistrationRateLimit,
} from '#server/remdo-oauth/registration-rate-limit';

describe('registration rate limit', () => {
  it('allows up to the max per user in a window, then rejects', () => {
    const limit = createRegistrationRateLimit(() => 1000);
    for (let i = 0; i < REGISTRATION_MAX; i += 1) {
      expect(limit.tryConsume('user-a'), `attempt ${i + 1}`).toBe(true);
    }
    expect(limit.tryConsume('user-a')).toBe(false);
  });

  it('keys per user — one user hitting the limit does not affect another', () => {
    const limit = createRegistrationRateLimit(() => 1000);
    for (let i = 0; i < REGISTRATION_MAX; i += 1) {
      limit.tryConsume('user-a');
    }
    expect(limit.tryConsume('user-a')).toBe(false);
    // A different account has its own untouched budget.
    expect(limit.tryConsume('user-b')).toBe(true);
  });

  it('resets after the window elapses', () => {
    let clock = 1000;
    const limit = createRegistrationRateLimit(() => clock);
    for (let i = 0; i < REGISTRATION_MAX; i += 1) {
      limit.tryConsume('user-a');
    }
    expect(limit.tryConsume('user-a')).toBe(false);

    clock += REGISTRATION_WINDOW_MS;
    expect(limit.tryConsume('user-a')).toBe(true);
  });
});
