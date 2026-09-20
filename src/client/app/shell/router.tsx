import { createBrowserRouter, redirect, redirectDocument } from 'react-router-dom';
import AppFrame from './AppFrame';
import AuthenticatedRoute from './AuthenticatedRoute';
import { devRoutes } from './devRoutes';
import { hasPendingSignOut, resolveSessionGateState } from '#client/app/session/client';
import type { SessionGateState } from '#client/app/session/client';
import {
  createPostAuthNextSearch,
  createSignInPath,
  resolvePostAuthPath,
} from '#client/app/session/post-auth-path';
import HomeRoute from './HomeRoute';
import SignOutRoute from '#client/app/session/SignOutRoute';
import OnlineGate from '#client/app/session/OnlineGate';
import DocumentRoute from '#client/app/workspace/DocumentRoute';
import SharingRoute from '#client/app/sharing/SharingRoute';
import { getCachedCurrentUserBootstrap } from '#client/app/user-data/current-user-bootstrap';
import {
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

async function homeRouteLoader(request: Request): Promise<{ sessionState: SessionGateState }> {
  const sessionState = await resolveSessionGateState();
  if (sessionState.status === 'unauthenticated') {
    if (!hasPendingSignOut()) {
      throw redirectDocument(createSignInPath(new URL(request.url).search));
    }
    return { sessionState };
  }

  const url = new URL(request.url);
  const search = url.search;
  if (sessionState.status === 'offline-unavailable') {
    return { sessionState };
  }
  if (sessionState.status === 'offline-remembered' && !getCachedCurrentUserBootstrap()) {
    return { sessionState: { status: 'offline-unavailable' } };
  }
  const target = resolvePostAuthPath(search, url.origin);

  if (target !== '/') {
    throw redirect(target);
  }
  if (search) {
    throw redirect('/');
  }
  return {
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
  const canonicalPath = createDocumentPath(parsed.docId, parsed.noteId);
  if (url.pathname !== canonicalPath) {
    throw redirect(`${canonicalPath}${url.search}`);
  }

  return { ...parsed, sessionState };
}

const hydrateFallbackElement = <div aria-hidden="true" />;

const appRoutes = [
  {
    path: 'sign-out',
    loader: async () => {
      const sessionState = await resolveSessionGateState();
      if (sessionState.status === 'unauthenticated') throw redirect('/');
      return { sessionState };
    },
    element: <OnlineGate allowOfflineSession><SignOutRoute /></OnlineGate>,
    hydrateFallbackElement,
  },
  {
    path: '/',
    loader: ({ request }: { request: Request }) => homeRouteLoader(request),
    element: <HomeRoute />,
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
