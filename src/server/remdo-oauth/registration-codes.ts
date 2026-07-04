import { randomBytes } from 'node:crypto';

// A source issues a one-time code when it registers a client for a home during
// the admin's interactive session, and stashes the issued credentials under it.
// The home then pulls the credentials from the source (a URL the home itself
// configured) with this code, so the secret is never pushed to an attacker-
// controllable URL and the source never fetches an arbitrary host.

export const CODE_TTL_MS = 5 * 60 * 1000;

interface RegistrationCodeCredentials {
  clientId: string;
  clientSecret: string;
}

interface StoredCode extends RegistrationCodeCredentials {
  expiresAt: number;
  // The home-issued handle for this registration. The claim must present it, so
  // the browser-carried code alone (which may leak from the admin's URL) cannot
  // release the client secret — only the home, which holds the handle server-side.
  handle: string;
}

export interface RegistrationCodeStore {
  issue: (credentials: RegistrationCodeCredentials, handle: string) => string;
  claim: (code: string, handle: string) => RegistrationCodeCredentials | null;
}

export function createRegistrationCodeStore(
  now: () => number = Date.now,
): RegistrationCodeStore {
  const codes = new Map<string, StoredCode>();

  function purgeExpired(): void {
    const current = now();
    for (const [code, entry] of codes) {
      if (entry.expiresAt <= current) {
        codes.delete(code);
      }
    }
  }

  return {
    issue(credentials, handle) {
      purgeExpired();
      const code = randomBytes(32).toString('base64url');
      codes.set(code, { ...credentials, handle, expiresAt: now() + CODE_TTL_MS });
      return code;
    },
    // Single-use: returns the credentials once, then forgets the code. Requires
    // the handle the code was issued for, so a leaked bare code cannot claim.
    claim(code, handle) {
      purgeExpired();
      const entry = codes.get(code);
      if (!entry || entry.handle !== handle) {
        return null;
      }
      codes.delete(code);
      if (entry.expiresAt <= now()) {
        return null;
      }
      return { clientId: entry.clientId, clientSecret: entry.clientSecret };
    },
  };
}
