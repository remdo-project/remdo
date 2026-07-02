import { randomBytes } from 'node:crypto';

// A source issues a one-time code when it registers a client for a home during
// the admin's interactive session, and stashes the issued credentials under it.
// The home then pulls the credentials from the source (a URL the home itself
// configured) with this code, so the secret is never pushed to an attacker-
// controllable URL and the source never fetches an arbitrary host.

const CODE_TTL_MS = 5 * 60 * 1000;

interface RegistrationCodeCredentials {
  clientId: string;
  clientSecret: string;
}

interface StoredCode extends RegistrationCodeCredentials {
  expiresAt: number;
}

export interface RegistrationCodeStore {
  issue: (credentials: RegistrationCodeCredentials) => string;
  claim: (code: string) => RegistrationCodeCredentials | null;
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
    issue(credentials) {
      purgeExpired();
      const code = randomBytes(32).toString('base64url');
      codes.set(code, { ...credentials, expiresAt: now() + CODE_TTL_MS });
      return code;
    },
    // Single-use: returns the credentials once, then forgets the code.
    claim(code) {
      purgeExpired();
      const entry = codes.get(code);
      if (!entry) {
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
