/** True when host is the supported bind-all address. */
export function isWildcardHost(host: string): boolean {
  return host === '0.0.0.0';
}

/**
 * Resolve a bind-all host to IPv4 loopback.
 * Returns the host unchanged when it is already concrete.
 */
export function resolveLoopbackHost(host: string): string {
  return isWildcardHost(host) ? '127.0.0.1' : host;
}
