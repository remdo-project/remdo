export interface DevRouteDefinition {
  id: string;
  path: `/${string}`;
  routerPath: string;
  directSpaFallback: boolean;
}

export const DEV_LEXICAL_DEMO_ROUTE: DevRouteDefinition = {
  id: 'lexical-demo',
  path: '/dev/lexical-demo',
  routerPath: 'dev/lexical-demo',
  directSpaFallback: true,
};

export const DEV_ROUTE_DEFINITIONS: readonly DevRouteDefinition[] = [
  DEV_LEXICAL_DEMO_ROUTE,
];

export const DEV_SPA_FALLBACK_PATHS: readonly string[] = DEV_ROUTE_DEFINITIONS
  .filter((route) => route.directSpaFallback)
  .map((route) => route.path);

export function isDevSpaFallbackPath(url?: string): boolean {
  const pathname = url?.split('?', 1)[0] ?? '';
  return DEV_SPA_FALLBACK_PATHS.includes(pathname);
}
