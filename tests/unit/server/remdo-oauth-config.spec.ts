import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServerAuth } from '#server/auth/auth';
import type { SqliteServerDatabaseClient } from '#server/db/client';
import { createServerDatabaseClient } from '#server/db/client';
import { deriveSourceId, deriveSourceServer, sourceOriginFromId } from '#server/remdo-oauth/config';
import type { StoredSourceServer } from '#server/remdo-oauth/source-server-store';

function decodeId(id: string): string {
  return Buffer.from(id, 'base64url').toString('utf8');
}

// Mirrors the plugin-inspection pattern in swappable-auth.spec.ts: the built
// genericOAuth provider config is the only place that proves what actually gets
// sent to Better Auth, so assert on it directly rather than on inputs.
function genericOAuthProviderConfigs(
  auth: ReturnType<typeof createServerAuth>['auth'],
): { clientSecret?: string | null; pkce?: boolean; providerId: string }[] {
  const options = auth.options as { plugins?: { id?: string; options?: { config?: { clientSecret?: string | null; pkce?: boolean; providerId: string }[] } }[] };
  const genericOAuth = options.plugins?.find((plugin) => plugin.id === 'generic-oauth');
  return genericOAuth?.options?.config ?? [];
}

describe('deriveSourceServer', () => {
  it('derives a source entry from a bare-origin URL', () => {
    const entry = deriveSourceServer('https://source.example');
    expect(entry).toMatchObject({
      label: 'source.example',
      baseUrl: 'https://source.example',
    });
    // The id reversibly encodes the full origin.
    expect(decodeId(entry.id)).toBe('https://source.example');
  });

  it('rejects anything that is not a bare http(s) origin with one actionable error', () => {
    for (const invalid of [
      'https://source.example/path', // carries a path
      'not-a-url', // unparseable
      'ftp://source.example', // wrong scheme
      'ws://source.example',
    ]) {
      expect(() => deriveSourceServer(invalid), invalid).toThrow('bare http(s) origin');
    }
  });
});

describe('deriveSourceId', () => {
  it('is a URL-safe, path-segment-safe encoding', () => {
    const id = deriveSourceId('https://source.example:8443');
    expect(id).toMatch(/^[\w-]+$/u);
  });

  it('gives distinct ids to origins differing only by scheme or port', () => {
    expect(deriveSourceId('https://source.example')).not.toBe(deriveSourceId('http://source.example'));
    expect(deriveSourceId('https://source.example')).not.toBe(deriveSourceId('https://source.example:8443'));
  });

  it('gives distinct ids to origins differing only in punctuation', () => {
    // A slug that collapsed punctuation would alias these; the encoding must not.
    expect(deriveSourceId('https://foo-bar.example')).not.toBe(deriveSourceId('https://foo.bar.example'));
  });
});

describe('sourceOriginFromId', () => {
  it('round-trips deriveSourceId back to the origin', () => {
    for (const origin of ['https://source.example', 'http://127.0.0.1:7070', 'https://source.example:8443']) {
      expect(sourceOriginFromId(deriveSourceId(origin))).toBe(origin);
    }
  });

  it('returns null for an id that does not decode to a bare http(s) origin', () => {
    expect(sourceOriginFromId(deriveSourceId('https://source.example/path'))).toBeNull();
    expect(sourceOriginFromId(deriveSourceId('ftp://source.example'))).toBeNull();
    expect(sourceOriginFromId('not-base64url-%%%')).toBeNull();
    expect(sourceOriginFromId('')).toBeNull();
  });
});

// A source registered as a public client stores only a client_id (no secret);
// the built genericOAuth provider must still exist and authenticate via PKCE
// alone, per docs/access-model.md#linking-a-source.
describe('genericOAuth provider for a public-client source', () => {
  let dir: string;
  let database: SqliteServerDatabaseClient;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-oauth-config-'));
    database = createServerDatabaseClient({ dbPath: path.join(dir, 'remdo.sqlite') });
  });

  afterEach(async () => {
    await database.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('builds a provider that omits clientSecret and keeps pkce true', () => {
    const sourceId = deriveSourceId('https://source.example');
    const sourceServers: StoredSourceServer[] = [{
      baseUrl: 'https://source.example',
      credentials: { clientId: 'public-client-id' },
      id: sourceId,
      label: 'source.example',
    }];
    const { auth } = createServerAuth({
      allowSignup: false,
      baseURL: 'http://127.0.0.1:4000',
      database,
      secret: 'test-better-auth-secret-0123456789',
      sourceServers,
    });

    const configs = genericOAuthProviderConfigs(auth);
    expect(configs).toHaveLength(1);
    expect(configs[0]?.providerId).toBe(sourceId);
    expect(configs[0]?.pkce).toBe(true);
    expect(configs[0]?.clientSecret).toBeUndefined();
  });
});
