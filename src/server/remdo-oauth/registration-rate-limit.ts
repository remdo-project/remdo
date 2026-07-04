// Bounds how many home registrations a single source account may perform in a
// window. register-home creates a persisted OAuth client, so without a bound a
// signed-in source user could register unbounded clients. Keyed by the source
// user id (the identity a client binds to) — the abuse principal — not by IP,
// which would let one NAT'd user block others or one user rotate IPs to evade.
// In-process, disposable state, like the registration handle/code stores.

export const REGISTRATION_MAX = 5;
export const REGISTRATION_WINDOW_MS = 60 * 1000;

export interface RegistrationRateLimit {
  // Records an attempt for the user and returns whether it is within the limit.
  tryConsume: (userId: string) => boolean;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export function createRegistrationRateLimit(
  now: () => number = Date.now,
  max: number = REGISTRATION_MAX,
  windowMs: number = REGISTRATION_WINDOW_MS,
): RegistrationRateLimit {
  const windows = new Map<string, Bucket>();

  return {
    tryConsume(userId) {
      const current = now();
      const existing = windows.get(userId);
      if (!existing || existing.resetAt <= current) {
        windows.set(userId, { count: 1, resetAt: current + windowMs });
        return true;
      }
      if (existing.count >= max) {
        return false;
      }
      existing.count += 1;
      return true;
    },
  };
}
