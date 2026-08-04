/** True when host is a bind-all address (0.0.0.0 or ::). */
export function isWildcardHost(host: string): boolean {
  return host === '0.0.0.0' || host === '::';
}

/**
 * Resolve a bind-all host to a concrete loopback/address.
 * Returns `fallback` when host is 0.0.0.0 or ::, otherwise returns host unchanged.
 */
export function resolveLoopbackHost(host: string, fallback = '127.0.0.1'): string {
  return isWildcardHost(host) ? fallback : host;
}

/** Format a bare host for use inside a URL: brackets an IPv6 literal (idempotently). */
export function formatUrlHost(host: string): string {
  const unwrapped = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  return unwrapped.includes(':') ? `[${unwrapped}]` : unwrapped;
}
