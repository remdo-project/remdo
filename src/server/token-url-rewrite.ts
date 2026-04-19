import type { ClientToken } from '@y-sweet/sdk';

function readForwardedHeader(headers: Headers, name: string): string | null {
  return headers.get(name)?.split(',')[0]?.trim() || null;
}

function resolveBrowserVisibleOrigin(request: Request): URL {
  const forwardedProto = readForwardedHeader(request.headers, 'x-forwarded-proto');
  const forwardedHost = readForwardedHeader(request.headers, 'x-forwarded-host');
  if (forwardedProto && forwardedHost) {
    return new URL(`${forwardedProto}://${forwardedHost}`);
  }

  return new URL(request.url);
}

function rewriteUrl(rawUrl: string, browserVisibleOrigin: URL, protocol: 'http' | 'ws'): string {
  const url = new URL(rawUrl);
  url.protocol =
    protocol === 'ws'
      ? (browserVisibleOrigin.protocol === 'https:' ? 'wss:' : 'ws:')
      : browserVisibleOrigin.protocol;
  url.host = browserVisibleOrigin.host;
  return url.toString();
}

export function rewriteTokenUrlsForRequest(token: ClientToken, request: Request): ClientToken {
  const browserVisibleOrigin = resolveBrowserVisibleOrigin(request);

  return {
    ...token,
    url: rewriteUrl(token.url, browserVisibleOrigin, 'ws'),
    baseUrl: rewriteUrl(token.baseUrl, browserVisibleOrigin, 'http'),
  };
}
