// The dev Lexical Demo route (see docs/dev/dev-tooling.md). One absolute path,
// shared by the router, the dev toolbar link, and the dev-server SPA bridge so
// they cannot drift.
export const DEV_LEXICAL_DEMO_ROUTE = '/dev/lexical-demo' as const;

export function isDevSpaFallbackPath(url?: string): boolean {
  const pathname = url?.split('?', 1)[0] ?? '';
  return pathname === DEV_LEXICAL_DEMO_ROUTE;
}
