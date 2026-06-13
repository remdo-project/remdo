import { describe, expect, it } from 'vitest';
import { rewriteTokenUrlsForOrigin } from '#server/token-url-rewrite';

describe('token URL rewrite', () => {
  it('uses the trusted browser origin and preserves path, search, and hash', () => {
    const token = rewriteTokenUrlsForOrigin(
      {
        docId: 'main',
        url: 'ws://127.0.0.1:4004/d/main?token=abc#socket',
        baseUrl: 'http://127.0.0.1:4004/d/main/api?token=abc#base',
      },
      new URL('https://app.remdo.localhost:4000'),
    );

    expect(token.url).toBe('wss://app.remdo.localhost:4000/d/main?token=abc#socket');
    expect(token.baseUrl).toBe('https://app.remdo.localhost:4000/d/main/api?token=abc#base');
  });

  it('downgrades protocol when the trusted browser origin is http', () => {
    const token = rewriteTokenUrlsForOrigin(
      {
        docId: 'main',
        url: 'wss://internal.example:4004/d/main',
        baseUrl: 'https://internal.example:4004/d/main',
      },
      new URL('http://app.remdo.localhost:4000'),
    );

    expect(token.url).toBe('ws://app.remdo.localhost:4000/d/main');
    expect(token.baseUrl).toBe('http://app.remdo.localhost:4000/d/main');
  });
});
