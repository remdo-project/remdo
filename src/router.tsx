import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router';
import App from './App';
import DocumentRoute from './routes/DocumentRoute';
import { DEFAULT_DOC_ID } from './routing';

const rootRoute = createRootRoute({
  component: App,
});

const documentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/n/$docId',
  validateSearch: (search) => ({
    zoom: typeof search.zoom === 'string' ? search.zoom : undefined,
    lexicalDemo: search.lexicalDemo === 'true' || search.lexicalDemo === true ? true : undefined,
  }),
  component: DocumentRoute,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  loader: ({ location }) => {
    const params = new URLSearchParams(location.search);
    const doc = params.get('doc')?.trim();
    const zoom = params.get('zoom')?.trim() ?? undefined;
    const lexicalDemo = params.has('lexicalDemo');
    throw redirect({
      to: documentRoute.to,
      params: { docId: doc || DEFAULT_DOC_ID },
      search: {
        zoom,
        lexicalDemo: lexicalDemo ? true : undefined,
      },
      replace: true,
    });
  },
});

export const routeTree = rootRoute.addChildren([indexRoute, documentRoute]);

export const router = createRouter({
  routeTree,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
