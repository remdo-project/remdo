import { DEV_LEXICAL_DEMO_ROUTE } from '#client/app/dev-route';

// Dev-only routes. Gated on `import.meta.env.DEV` (statically false in the prod
// build) and loaded via dynamic import so the route and its editor leave the
// production bundle. See docs/dev/dev-tooling.md.
export const devRoutes = import.meta.env.DEV
  ? [{
    path: DEV_LEXICAL_DEMO_ROUTE,
    lazy: async () => ({
      Component: (await import('#client/editor/dev/VanillaLexicalEditor')).default,
    }),
  }]
  : [];
