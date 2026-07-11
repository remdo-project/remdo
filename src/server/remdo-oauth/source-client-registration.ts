export interface RegisterPublicClientParams {
  sourceBaseUrl: string;
  homeOrigin: string;
  sourceId: string;
  scopes: readonly string[];
}

// Thrown when the source refuses registration with a 4xx/429 — an expected
// user/upstream outcome (private source, not a RemDo server, rate limited), not a
// home fault. Carries the source's status so the route can answer with a client
// error rather than a 500.
export class SourceRegistrationError extends Error {
  constructor(readonly status: number) {
    super(`Source client registration failed: ${status}`);
    this.name = 'SourceRegistrationError';
  }
}

// Registers a PUBLIC OAuth client (token_endpoint_auth_method: "none", no
// secret) on a source via its dynamic-registration endpoint. The redirect_uri is
// locked to the home's own callback and linked to the source's own protected
// resource; the source enforces both at authorize+token. No secret is issued or
// stored — a public client relies on PKCE per authorization.
export async function registerPublicSourceClient(
  params: RegisterPublicClientParams,
  deps: { fetch?: typeof fetch } = {},
): Promise<{ clientId: string }> {
  const doFetch = deps.fetch ?? fetch;
  const response = await doFetch(`${params.sourceBaseUrl}/api/auth/oauth2/register`, {
    method: 'POST',
    // Do not follow redirects: this is an outbound request to a user-supplied
    // origin, so a 30x from the source must not bounce it to an arbitrary
    // internal/metadata URL. A real source answers the POST directly.
    redirect: 'error',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: `RemDo home ${params.homeOrigin}`,
      redirect_uris: [`${params.homeOrigin}/api/auth/callback/${params.sourceId}`],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: params.scopes.join(' '),
      resources: [params.sourceBaseUrl],
    }),
  });
  if (!response.ok) {
    throw new SourceRegistrationError(response.status);
  }
  const data = (await response.json()) as { client_id?: string };
  if (!data.client_id) {
    throw new Error('Source returned no client_id.');
  }
  return { clientId: data.client_id };
}
