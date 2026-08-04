/** True when host is a bind-all address (0.0.0.0 or ::). */
export function isWildcardHost(host: string): boolean {
  return host === '0.0.0.0' || host === '::';
}

/**
 * Resolve a bind-all host to IPv4 loopback.
 * Returns the host unchanged when it is already concrete.
 */
export function resolveLoopbackHost(host: string): string {
  return isWildcardHost(host) ? '127.0.0.1' : host;
}

/** Format a bare host for use inside a URL: brackets an IPv6 literal (idempotently). */
export function formatUrlHost(host: string): string {
  const unwrapped = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  return unwrapped.includes(':') ? `[${unwrapped}]` : unwrapped;
}
