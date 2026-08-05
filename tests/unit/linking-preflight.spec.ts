import { describe, expect, it } from 'vitest';
import {
  assertAuthorizationServerOrigin,
  assertPublicSourceConfig,
  fetchSourceJson,
} from '../../tools/dev/linking-preflight-lib';

describe('source-linking preflight', () => {
  it('accepts metadata under the configured source origin', () => {
    expect(() => assertAuthorizationServerOrigin({
      authorization_endpoint: 'http://localhost:4000/api/auth/oauth2/authorize',
    }, 'http://localhost:4000')).not.toThrow();
  });

  it('rejects missing or mismatched source metadata', () => {
    expect(() => assertAuthorizationServerOrigin({}, 'http://localhost:4000')).toThrow(
      'does not advertise an authorization endpoint',
    );
    expect(() => assertAuthorizationServerOrigin({
      authorization_endpoint: 'http://localhost:5000/api/auth/oauth2/authorize',
    }, 'http://localhost:4000')).toThrow(
      'advertises http://localhost:5000, but current configuration resolves http://localhost:4000',
    );
  });

  it('rejects a running source whose actual policy is private', () => {
    expect(() => assertPublicSourceConfig({ publicServer: true })).not.toThrow();
    expect(() => assertPublicSourceConfig({ publicServer: false })).toThrow(
      'The running development source is private',
    );
  });

  it('reports the failing source endpoint for transport and JSON errors', async () => {
    const sourceConfigUrl = new URL('http://localhost:4000/api/config');

    await expect(fetchSourceJson(
      sourceConfigUrl,
      'Development source config',
      () => Promise.reject(new Error('connection reset')),
    )).rejects.toThrow(`Development source config is not reachable at ${sourceConfigUrl}`);

    await expect(fetchSourceJson(
      sourceConfigUrl,
      'Development source config',
      () => Promise.resolve(new Response('not json')),
    )).rejects.toThrow(`Development source config returned invalid JSON at ${sourceConfigUrl}`);
  });
});
