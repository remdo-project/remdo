export interface PublicClientConfig {
  publicServer: boolean;
}

let cached: PublicClientConfig | null = null;

// Unauthenticated public config for the pre-auth UI (e.g. the login page gating
// its admin link on signup policy). Cached per session; defaults conservatively
// to a private server if the request fails, so the admin link is not shown on an
// uncertain state.
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
  cached = { publicServer: false };
  return cached;
}
