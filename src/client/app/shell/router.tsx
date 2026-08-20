import { createBrowserRouter, redirect, redirectDocument } from 'react-router-dom';
import AppFrame from './AppFrame';
import AuthenticatedRoute from './AuthenticatedRoute';
import { getPublicClientConfig } from './config';
import { adminRouteLoader } from '#client/app/admin/admin-route-loader';
import AdminRoute from '#client/app/admin/AdminRoute';
import { devRoutes } from './devRoutes';
import { resolveSessionGateState } from '#client/app/session/client';
import type { SessionGateState } from '#client/app/session/client';
import { resolveAuthenticatedLoginRedirect } from '#client/app/session/login-redirect';
import OAuthConsentRoute from '#client/app/session/OAuthConsentRoute';
import OnlineGate from '#client/app/session/OnlineGate';
import {
  createPostAuthNextSearch,
  resolvePostAuthPath,
} from '#client/app/session/post-auth-path';
import RootRoute from './RootRoute';
import type { RootRouteLoaderData } from './RootRoute';
import SharingRoute from '#client/app/sharing/SharingRoute';
import { getCachedCurrentUserBootstrap, getHomeDocumentId } from '#client/app/user-data/current-user-bootstrap';
import DocumentRoute from '#client/app/workspace/DocumentRoute';
import {
  createCanonicalDocumentPath,
  createDocumentPath,
  parseDocumentRef,
} from '#document-routes';

async function requireAuthenticatedRoute(request: Request): Promise<SessionGateState> {
  const sessionState = await resolveSessionGateState();
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
    return { sessionState };
  }
  let homeDocumentId: string;
  let target: string;
  if (sessionState.status === 'offline-remembered') {
    const bootstrap = getCachedCurrentUserBootstrap();
    if (!bootstrap) {
      return { sessionState: { status: 'offline-unavailable' } };
    }
    homeDocumentId = bootstrap.homeDocumentId;
    target = resolvePostAuthPath(search, url.origin);
  } else {
    const redirectTarget = resolveAuthenticatedLoginRedirect(search, url.origin);
    if (redirectTarget.kind === 'document-redirect') {
      throw redirectDocument(redirectTarget.href);
    }
    homeDocumentId = await getHomeDocumentId();
    target = redirectTarget.path;
  }

  if (target !== '/' && target !== createDocumentPath(homeDocumentId)) {
    throw redirect(target);
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

async function documentLoader({ request, params }: {
  request: Request;
  params: { docRef?: string };
}) {
  const url = new URL(request.url);
  const sessionState = await requireAuthenticatedRoute(request);
  if (sessionState.status === 'offline-unavailable') {
    return { sessionState };
  }

  const parsed = parseDocumentRef(params.docRef);
  if (!parsed) {
    throw redirect(`/${url.search}`);
  }

  const bootstrap = sessionState.status === 'offline-remembered'
    ? getCachedCurrentUserBootstrap()
    : null;
  if (sessionState.status === 'offline-remembered' && !bootstrap) {
    return { sessionState: { status: 'offline-unavailable' } as const };
  }
  const homeDocumentId = bootstrap?.homeDocumentId ?? await getHomeDocumentId();
  const canonicalPath = createCanonicalDocumentPath(
    parsed.docId,
    parsed.noteId,
    homeDocumentId,
  );
  if (url.pathname !== canonicalPath) {
    throw redirect(`${canonicalPath}${url.search}`);
  }

  return { ...parsed, homeDocumentId, sessionState };
}

const hydrateFallbackElement = <div aria-hidden="true" />;

const appRoutes = [
  {
    path: '/',
    loader: ({ request }: { request: Request }) => rootRouteLoader(request),
    element: <RootRoute />,
    hydrateFallbackElement,
  },
  {
    // Public: the enroll form for an unauthenticated / non-admin visitor (a
    // first-time operator bootstraps here), and the panel wrapped in the app
    // shell for an authenticated admin. The loader chooses; the action is
    // ADMIN_SECRET-gated server-side either way.
    path: '/admin',
    loader: adminRouteLoader,
    element: (
      <OnlineGate>
        <AdminRoute />
      </OnlineGate>
    ),
    hydrateFallbackElement,
  },
  {
    // Source-side consent screen: shown when a home's user authorizes the home to
    // act on their behalf. Reachable only with a source session.
    path: '/oauth/consent',
    loader: authenticatedSessionLoader,
    element: (
      <OnlineGate>
        <OAuthConsentRoute />
      </OnlineGate>
    ),
    hydrateFallbackElement,
  },
  {
    path: 'n/:docRef',
    loader: documentLoader,
    element: (
      <AuthenticatedRoute>
        <DocumentRoute />
      </AuthenticatedRoute>
    ),
    hydrateFallbackElement,
  },
  {
    element: <AuthenticatedRoute />,
    loader: authenticatedSessionLoader,
    hydrateFallbackElement,
    children: [
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
