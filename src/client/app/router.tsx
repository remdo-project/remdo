import { createBrowserRouter, redirect, redirectDocument } from 'react-router-dom';
import AppFrame from './AppFrame';
import AuthenticatedApp from './AuthenticatedApp';
import { resolveSessionGateState } from './auth/client';
import type { SessionGateState } from './auth/client';
import { getPublicClientConfig } from './config';
import { getCachedCurrentUserBootstrap, getHomeDocumentId } from './documents/current-user-bootstrap';
import AdminRoute from './routes/AdminRoute';
import { adminRouteLoader } from './routes/admin-route-loader';
import { devRoutes } from './routes/devRoutes';
import OAuthConsentRoute from './routes/OAuthConsentRoute';
import DocumentRoute from './routes/DocumentRoute';
import LogoutRoute from './routes/LogoutRoute';
import OfflineRoute from './routes/OfflineRoute';
import RootRoute from './routes/RootRoute';
import type { RootRouteLoaderData } from './routes/RootRoute';
import SharingRoute from './routes/SharingRoute';
import {
  createPostAuthNextSearch,
  resolveNextPathOrDefault,
} from './routes/post-auth-path';
import { resolveAuthenticatedLoginRedirect } from './routes/login-redirect';
import {
  createDocumentPath,
  parseDocumentRef,
} from '#document-routes';

function createOfflinePath(request: Request): string {
  return `/offline${createPostAuthNextSearch(request)}`;
}

async function requireAuthenticatedRoute(request: Request): Promise<SessionGateState> {
  const sessionState = await resolveSessionGateState();
  if (sessionState.status === 'offline-unavailable') {
    throw redirect(createOfflinePath(request));
  }
  if (sessionState.status !== 'unauthenticated') {
    return sessionState;
  }

  throw redirect(`/${createPostAuthNextSearch(request)}`);
}

async function authenticatedSessionLoader({ request }: { request: Request }) {
  return { sessionState: await requireAuthenticatedRoute(request) };
}

async function rootRouteLoader(request: Request): Promise<RootRouteLoaderData> {
  const sessionState = await resolveSessionGateState();
  if (sessionState.status === 'unauthenticated') {
    // Carry the public-server flag so the login page can gate its admin link.
    return {
      publicServer: (await getPublicClientConfig()).publicServer,
      sessionState,
    };
  }

  const url = new URL(request.url);
  const search = url.search;
  if (sessionState.status === 'offline-unavailable') {
    throw redirect(createOfflinePath(request));
  }
  if (sessionState.status === 'offline-remembered') {
    const bootstrap = getCachedCurrentUserBootstrap();
    if (!bootstrap) {
      throw redirect(createOfflinePath(request));
    }
    const target = resolveNextPathOrDefault(
      search,
      url.origin,
      '/',
    );
    if (target !== '/' && target !== createDocumentPath(bootstrap.homeDocumentId)) {
      throw redirect(target);
    }
    if (search) {
      throw redirect('/');
    }
    return {
      docId: bootstrap.homeDocumentId,
      homeDocumentId: bootstrap.homeDocumentId,
      noteId: null,
      sessionState,
    };
  }

  const redirectTarget = resolveAuthenticatedLoginRedirect(search, url.origin);
  if (redirectTarget.kind === 'document-redirect') {
    throw redirectDocument(redirectTarget.href);
  }
  const homeDocumentId = await getHomeDocumentId();
  if (redirectTarget.path !== '/' && redirectTarget.path !== createDocumentPath(homeDocumentId)) {
    throw redirect(redirectTarget.path);
  }
  if (search) {
    throw redirect('/');
  }
  return {
    docId: homeDocumentId,
    homeDocumentId,
    noteId: null,
    sessionState,
  };
}

async function resolveRouteHomeDocumentId(request: Request): Promise<string> {
  const sessionState = await resolveSessionGateState();
  if (sessionState.status === 'unauthenticated') {
    throw redirect(`/${createPostAuthNextSearch(request)}`);
  }
  if (sessionState.status === 'offline-unavailable') {
    throw redirect(createOfflinePath(request));
  }
  if (sessionState.status === 'offline-remembered') {
    const bootstrap = getCachedCurrentUserBootstrap();
    if (!bootstrap) {
      throw redirect(createOfflinePath(request));
    }
    return bootstrap.homeDocumentId;
  }
  return getHomeDocumentId();
}

type DocumentPathBuilder = (docId: string, noteId?: string | null) => string;

const createDocumentLoader = (buildPath: DocumentPathBuilder) => {
  return async ({ request, params }: { request: Request; params: { docRef?: string } }) => {
    const url = new URL(request.url);
    const parsed = parseDocumentRef(params.docRef);
    if (!parsed) {
      throw redirect(`/${url.search}`);
    }

    const homeDocumentId = await resolveRouteHomeDocumentId(request);
    if (parsed.docId === homeDocumentId && parsed.noteId === null) {
      throw redirect(`/${url.search}`);
    }
    const canonicalPath = buildPath(parsed.docId, parsed.noteId);
    if (url.pathname !== canonicalPath) {
      throw redirect(`${canonicalPath}${url.search}`);
    }

    return { ...parsed, homeDocumentId };
  };
};

const hydrateFallbackElement = <div aria-hidden="true" />;

const appRoutes = [
  {
    path: '/offline',
    element: <OfflineRoute />,
    hydrateFallbackElement,
  },
  {
    path: '/',
    loader: ({ request }: { request: Request }) => rootRouteLoader(request),
    element: <RootRoute />,
    hydrateFallbackElement,
  },
  {
    path: '/logout',
    element: <LogoutRoute />,
    hydrateFallbackElement,
  },
  {
    // Public: the enroll form for an unauthenticated / non-admin visitor (a
    // first-time operator bootstraps here), and the panel wrapped in the app
    // shell for an authenticated admin. The loader chooses; the action is
    // ADMIN_SECRET-gated server-side either way.
    path: '/admin',
    loader: adminRouteLoader,
    element: <AdminRoute />,
    hydrateFallbackElement,
  },
  {
    // Source-side consent screen: shown when a home's user authorizes the home to
    // act on their behalf. Reachable only with a source session.
    path: '/oauth/consent',
    loader: authenticatedSessionLoader,
    element: <OAuthConsentRoute />,
    hydrateFallbackElement,
  },
  {
    element: <AuthenticatedApp />,
    loader: authenticatedSessionLoader,
    hydrateFallbackElement,
    children: [
      {
        path: 'n/:docRef',
        loader: createDocumentLoader(createDocumentPath),
        element: <DocumentRoute />,
      },
      {
        path: 'sharing',
        element: <SharingRoute />,
      },
      ...devRoutes,
    ],
  },
];

const routes = [{
  element: <AppFrame />,
  children: appRoutes,
}];

export const router = createBrowserRouter(routes);
