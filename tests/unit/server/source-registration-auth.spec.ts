// The source's OAuth registration gate. URL-first linking self-registers the
// home's public client by a server-to-server call with NO source session, so a
// public source must accept UNAUTHENTICATED dynamic registration
// (allowUnauthenticatedClientRegistration, gated on allowSignup). A private
// source must refuse it. These are the exact conditions the Docker linking e2e
// depends on; a regression here breaks cross-server linking.
import { describe, expect, it } from 'vitest';
import { createServerAppHarness } from './_support/server-app-harness';
import { createTestResource } from '../_support/test-resource';

const createHarness = createTestResource(createServerAppHarness);
const SOURCE_ORIGIN = 'https://source.example';

const registerBody = JSON.stringify({
  client_name: 'RemDo home https://home.private',
  redirect_uris: ['https://home.private/api/auth/callback/src'],
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  token_endpoint_auth_method: 'none',
  scope: 'openid',
  resources: [SOURCE_ORIGIN],
});

describe('source OAuth registration gate', () => {
  it('accepts unauthenticated public-client registration on a public source', async () => {
    const harness = createHarness({ allowSignup: true, baseURL: SOURCE_ORIGIN });
    const res = await harness.app.request('/api/auth/oauth2/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: registerBody,
    });
    const body = await res.json() as { client_id?: string; client_secret?: string; resources?: string[] };
    expect(res.status).toBeLessThan(400);
    expect(body.client_id).toBeTruthy();
    expect(body.resources).toEqual([SOURCE_ORIGIN]);
    // Public client: no secret is issued (PKCE authenticates the exchange).
    expect(body.client_secret).toBeFalsy();
  });

  it('refuses unauthenticated registration on a private (non-public) source', async () => {
    const harness = createHarness({ allowSignup: false, baseURL: SOURCE_ORIGIN });
    const res = await harness.app.request('/api/auth/oauth2/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: registerBody,
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
