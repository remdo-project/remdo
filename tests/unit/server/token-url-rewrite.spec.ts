import { describe, expect, it } from 'vitest';
import { rewriteTokenUrlsForRequest } from '@/server/token-url-rewrite';

describe('token URL rewrite', () => {
  it('prefers forwarded headers and preserves path, search, and hash', () => {
    const request = new Request('http://127.0.0.1:4011/api/documents/main/token', {
      method: 'POST',
      headers: {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'app.remdo.localhost:4000',
      },
    });

    const token = rewriteTokenUrlsForRequest(
      {
        docId: 'main',
        url: 'ws://127.0.0.1:4004/d/main?token=abc#socket',
        baseUrl: 'http://127.0.0.1:4004/d/main/api?token=abc#base',
      },
      request,
    );

    expect(token.url).toBe('wss://app.remdo.localhost:4000/d/main?token=abc#socket');
    expect(token.baseUrl).toBe('https://app.remdo.localhost:4000/d/main/api?token=abc#base');
  });

  it('falls back to the request URL origin when forwarded headers are absent', () => {
    const request = new Request('http://app.remdo.localhost:4000/api/documents/main/token', {
      method: 'POST',
    });

    const token = rewriteTokenUrlsForRequest(
      {
        docId: 'main',
        url: 'wss://internal.example:4004/d/main',
        baseUrl: 'https://internal.example:4004/d/main',
      },
      request,
    );

    expect(token.url).toBe('ws://app.remdo.localhost:4000/d/main');
    expect(token.baseUrl).toBe('http://app.remdo.localhost:4000/d/main');
  });
});
