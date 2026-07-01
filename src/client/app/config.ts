export interface PublicClientConfig {
  publicServer: boolean;
}

let cached: PublicClientConfig | null = null;

// Unauthenticated public config for the pre-auth UI (e.g. the login page gating
// its admin link on signup policy). Cached per session. On failure it defaults
// to `publicServer: true` — the conservative choice, since the login page hides
// the admin-setup link on a public server, so an unknown policy hides it rather
// than leaking it on a transient error.
export async function getPublicClientConfig(): Promise<PublicClientConfig> {
  if (cached) {
    return cached;
  }
  try {
    const response = await fetch('/api/config');
    if (response.ok) {
      const body = await response.json() as Partial<PublicClientConfig>;
      cached = { publicServer: body.publicServer === true };
      return cached;
    }
  } catch {
    // fall through to the conservative default
  }
  cached = { publicServer: true };
  return cached;
}
