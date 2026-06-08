/**
 * Resolve a bind-all host to a concrete loopback/address.
 * Returns `fallback` when host is 0.0.0.0 or ::, otherwise returns host unchanged.
 */
export function resolveLoopbackHost(host: string, fallback = '127.0.0.1'): string {
  return host === '0.0.0.0' || host === '::' ? fallback : host;
}
