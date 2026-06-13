import type { ClientToken } from '@y-sweet/sdk';

function rewriteUrl(rawUrl: string, browserVisibleOrigin: URL, protocol: 'http' | 'ws'): string {
  const url = new URL(rawUrl);
  url.protocol =
    protocol === 'ws'
      ? (browserVisibleOrigin.protocol === 'https:' ? 'wss:' : 'ws:')
      : browserVisibleOrigin.protocol;
  url.host = browserVisibleOrigin.host;
  return url.toString();
}

export function rewriteTokenUrlsForOrigin(token: ClientToken, browserVisibleOrigin: URL): ClientToken {
  return {
    ...token,
    url: rewriteUrl(token.url, browserVisibleOrigin, 'ws'),
    baseUrl: rewriteUrl(token.baseUrl, browserVisibleOrigin, 'http'),
  };
}
