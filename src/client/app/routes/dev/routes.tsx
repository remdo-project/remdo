import { DEV_LEXICAL_DEMO_ROUTE } from '#client/app/dev/dev-route';

// Dev-only routes. Gated on `import.meta.env.DEV` (statically false in the prod
// build) and loaded via dynamic import so the route and its editor leave the
// production bundle. See docs/dev/dev-tooling.md.
export const devRoutes = import.meta.env.DEV
  ? [{
    // Child of the `/` route, so the path is relative (no leading slash).
    path: DEV_LEXICAL_DEMO_ROUTE.slice(1),
    lazy: async () => ({
      Component: (await import('./DevLexicalDemoRoute')).default,
    }),
  }]
  : [];
