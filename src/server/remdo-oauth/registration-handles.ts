import { randomBytes } from 'node:crypto';

// A home issues a single-use handle when an admin starts registering the home on
// a source. The handle travels to the source via a top-level browser navigation
// and comes back on the source's server-to-server credential handback; matching
// it is what authorizes the handback (only the real flow returns a handle the
// home issued). Handles are short-lived in-process state — registration is an
// immediate interactive action, so durability across restarts is unnecessary.

export const HANDLE_TTL_MS = 10 * 60 * 1000;

interface PendingRegistration {
  sourceId: string;
  expiresAt: number;
}

export interface RegistrationHandleStore {
  issue: (sourceId: string) => string;
  consume: (handle: string, sourceId: string) => boolean;
  // The home recovers the handle for an in-flight registration from its own
  // server state (keyed by source), so the handle never has to ride in the
  // browser — a URL leak then cannot carry the value that authorizes the claim.
  findBySource: (sourceId: string) => string | null;
}

export function createRegistrationHandleStore(
  now: () => number = Date.now,
): RegistrationHandleStore {
  const pending = new Map<string, PendingRegistration>();

  function purgeExpired(): void {
    const current = now();
    for (const [handle, entry] of pending) {
      if (entry.expiresAt <= current) {
        pending.delete(handle);
      }
    }
  }

  return {
    issue(sourceId) {
      purgeExpired();
      // Only one registration per source is in flight at a time: a repeat Register
      // (the offered retry) supersedes the prior handle. Otherwise the source
      // would bind the new code to the new handle while findBySource still
      // returned the old one, wedging the claim until the old handle's TTL.
      for (const [existing, entry] of pending) {
        if (entry.sourceId === sourceId) {
          pending.delete(existing);
        }
      }
      const handle = randomBytes(32).toString('base64url');
      pending.set(handle, { sourceId, expiresAt: now() + HANDLE_TTL_MS });
      return handle;
    },
    // Validates and single-use-consumes a handle. Returns true only when the
    // handle is known, unexpired, and bound to the same source it was issued for.
    consume(handle, sourceId) {
      purgeExpired();
      const entry = pending.get(handle);
      if (!entry || entry.sourceId !== sourceId) {
        return false;
      }
      pending.delete(handle);
      return entry.expiresAt > now();
    },
    findBySource(sourceId) {
      purgeExpired();
      for (const [handle, entry] of pending) {
        if (entry.sourceId === sourceId && entry.expiresAt > now()) {
          return handle;
        }
      }
      return null;
    },
  };
}
