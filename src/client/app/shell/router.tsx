import { createBrowserRouter, redirect, redirectDocument } from 'react-router-dom';
import AppFrame from './AppFrame';
import AuthenticatedRoute from './AuthenticatedRoute';
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
import HomeRoute from './HomeRoute';
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
    return { sessionState };
  }

  const url = new URL(request.url);
  const search = url.search;
  if (sessionState.status === 'offline-unavailable') {
    return { sessionState };
  }
  let target: string;
  if (sessionState.status === 'offline-remembered') {
    const bootstrap = getCachedCurrentUserBootstrap();
    if (!bootstrap) {
      return { sessionState: { status: 'offline-unavailable' } };
    }
    target = resolvePostAuthPath(search, url.origin);
  } else {
    const redirectTarget = resolveAuthenticatedLoginRedirect(search, url.origin);
    if (redirectTarget.kind === 'document-redirect') {
      throw redirectDocument(redirectTarget.href);
    }
    target = redirectTarget.path;
  }

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
    path: '/',
    loader: ({ request }: { request: Request }) => homeRouteLoader(request),
    element: <HomeRoute />,
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
