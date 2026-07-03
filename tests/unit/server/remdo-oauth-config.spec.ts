import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { deriveSourceId, deriveSourceServer, sourceOriginFromId } from '#server/remdo-oauth/config';

function decodeId(id: string): string {
  return Buffer.from(id, 'base64url').toString('utf8');
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
