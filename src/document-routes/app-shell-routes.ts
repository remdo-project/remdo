// The Django app-page routes (backend/remdo/urls.py) and this PWA navigation
// fallback must agree; a route missing from either one fails only offline or
// only online. Workbox matches pathname plus search, so each pattern tolerates
// a query string. Vite config bundles this module outside the package-imports
// resolver, so it must stay dependency-free.
const APP_SHELL_PATH_BODIES: readonly string[] = [
  '/',
  '/n/[^?]*',
  '/sign-out/?',
];

export const APP_SHELL_ROUTE_PATTERNS: readonly RegExp[] = APP_SHELL_PATH_BODIES.map(
  (body) => new RegExp(`^${body}(?:\\?.*)?$`, 'u'),
);

export function isAppShellPath(pathAndSearch: string): boolean {
  return APP_SHELL_ROUTE_PATTERNS.some((pattern) => pattern.test(pathAndSearch));
}
