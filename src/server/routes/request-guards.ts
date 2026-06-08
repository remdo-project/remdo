function readForwardedHeader(headers: Headers, name: string): string | null {
  return headers.get(name)?.split(',')[0]?.trim() || null;
}

function resolveRequestOrigin(request: Request): string {
  const forwardedProto = readForwardedHeader(request.headers, 'x-forwarded-proto');
  const forwardedHost = readForwardedHeader(request.headers, 'x-forwarded-host');
  if (forwardedProto && forwardedHost) {
    return new URL(`${forwardedProto}://${forwardedHost}`).origin;
  }
  return new URL(request.url).origin;
}

function hasJsonContentType(request: Request): boolean {
  return request.headers.get('content-type')?.toLowerCase().split(';')[0]?.trim() === 'application/json';
}

function isSameOriginMutation(request: Request): boolean {
  const origin = request.headers.get('origin');
  return !origin || origin === resolveRequestOrigin(request);
}

export function acceptsSharingMutation(request: Request): boolean {
  return hasJsonContentType(request)
    && request.headers.get('x-remdo-action') === 'sharing'
    && isSameOriginMutation(request);
}

export function acceptsSourceServerLinkMutation(request: Request): boolean {
  return hasJsonContentType(request)
    && request.headers.get('x-remdo-action') === 'source-server-link'
    && isSameOriginMutation(request);
}
