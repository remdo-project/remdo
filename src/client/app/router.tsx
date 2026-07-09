import { createBrowserRouter, redirect, redirectDocument } from 'react-router-dom';
import AuthenticatedApp from './AuthenticatedApp';
import { resolveSessionGateState } from './auth/client';
import { getPublicClientConfig } from './config';
import { getCachedCurrentUserBootstrap, getHomeDocumentId } from './documents/current-user-bootstrap';
import AdminRoute from './routes/AdminRoute';
import { adminRouteLoader } from './routes/admin-route-loader';
import { devRoutes } from './routes/devRoutes';
import OAuthConsentRoute from './routes/OAuthConsentRoute';
import DocumentRoute from './routes/DocumentRoute';
import LoginRoute from './routes/LoginRoute';
import LogoutRoute from './routes/LogoutRoute';
import OfflineRoute from './routes/OfflineRoute';
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
import { normalizeDocumentId } from '#domain/documents/ids';

function createOfflinePath(request: Request): string {
  return `/offline${createPostAuthNextSearch(request)}`;
}

function resolveCachedHomeDocumentPath(): string | null {
  const bootstrap = getCachedCurrentUserBootstrap();
  return bootstrap ? createDocumentPath(bootstrap.homeDocumentId) : null;
}

async function requireAuthenticatedRoute(request: Request) {
  const sessionState = await resolveSessionGateState();
  if (sessionState.status === 'offline-unavailable') {
    throw redirect(createOfflinePath(request));
  }
  if (sessionState.status !== 'unauthenticated') {
    return null;
  }

  throw redirect(`/login${createPostAuthNextSearch(request)}`);
}

async function requirePublicAuthRoute(request: Request) {
  const sessionState = await resolveSessionGateState();
  if (sessionState.status === 'unauthenticated') {
    // Carry the public-server flag so the login page can gate its admin link.
    return { publicServer: (await getPublicClientConfig()).publicServer };
  }

  const url = new URL(request.url);
  const search = url.search;
  if (sessionState.status === 'offline-unavailable') {
    throw redirect(createOfflinePath(request));
  }
  if (sessionState.status === 'offline-remembered') {
    throw redirect(resolveNextPathOrDefault(
      search,
      url.origin,
      resolveCachedHomeDocumentPath() ?? createOfflinePath(request),
    ));
  }

  const redirectTarget = await resolveAuthenticatedLoginRedirect(search, url.origin);
  throw redirectTarget.kind === 'document-redirect'
    ? redirectDocument(redirectTarget.href)
    : redirect(redirectTarget.path);
}

const redirectToDoc = async (request: Request): Promise<string> => {
  const url = new URL(request.url);
  const params = url.searchParams;
  const explicitDocId = normalizeDocumentId(params.get('doc'));
  const docId = explicitDocId ?? await resolveRouteHomeDocumentId(request);
  return createDocumentPath(docId);
};

async function resolveRouteHomeDocumentId(request: Request): Promise<string> {
  const sessionState = await resolveSessionGateState();
  if (sessionState.status === 'unauthenticated') {
    throw redirect(`/login${createPostAuthNextSearch(request)}`);
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
      throw redirect(`${buildPath(await resolveRouteHomeDocumentId(request))}${url.search}`);
    }

    const canonicalPath = buildPath(parsed.docId, parsed.noteId);
    if (url.pathname !== canonicalPath) {
      throw redirect(`${canonicalPath}${url.search}`);
    }

    return parsed;
  };
};

const hydrateFallbackElement = <div aria-hidden="true" />;

const routes = [
  {
    path: '/offline',
    element: <OfflineRoute />,
    hydrateFallbackElement,
  },
  {
    path: '/login',
    loader: ({ request }: { request: Request }) => requirePublicAuthRoute(request),
    element: <LoginRoute />,
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
    loader: ({ request }: { request: Request }) => requireAuthenticatedRoute(request),
    element: <OAuthConsentRoute />,
    hydrateFallbackElement,
  },
  {
    path: '/',
    element: <AuthenticatedApp />,
    loader: ({ request }: { request: Request }) => requireAuthenticatedRoute(request),
    hydrateFallbackElement,
    children: [
      {
        index: true,
        loader: async ({ request }: { request: Request }) => {
          throw redirect(await redirectToDoc(request));
        },
      },
      {
        path: 'home',
        loader: async ({ request }: { request: Request }) => {
          const url = new URL(request.url);
          throw redirect(`${createDocumentPath(await resolveRouteHomeDocumentId(request))}${url.search}`);
        },
        element: hydrateFallbackElement,
      },
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

export const router = createBrowserRouter(routes);
