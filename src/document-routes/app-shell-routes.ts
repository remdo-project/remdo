// The gateway bypass and the PWA navigation fallback must agree on which paths
// the application shell serves; a route missing from either one fails only
// offline or only in production. Workbox matches pathname plus search, so each
// pattern tolerates a query string. Vite config bundles this module outside the
// package-imports resolver, so it must stay dependency-free.
// `/n/...` mirrors production Caddy's `path /n/*`, which serves the shell for
// every suffix: the router renders its own miss for an unmatched document ref.
const APP_SHELL_PATH_BODIES: readonly string[] = [
  '/',
  '/n/[^?]*',
  '/sign-out/?',
];

export const APP_SHELL_ROUTE_PATTERNS: readonly RegExp[] = APP_SHELL_PATH_BODIES.map(
  (body) => new RegExp(`^${body}(?:\\?.*)?$`, 'u'),
);

export function isAppShellPath(pathname: string): boolean {
  return APP_SHELL_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname));
}
