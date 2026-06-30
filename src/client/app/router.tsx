import { createBrowserRouter, redirect, redirectDocument } from 'react-router-dom';
import App from './App';
import { resolveSessionGateState } from './auth/client';
import { getCachedCurrentUserBootstrap, getHomeDocumentId } from './documents/current-user-bootstrap';
import AdminEnrollRoute from './routes/AdminEnrollRoute';
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

const buildSearch = (lexicalDemo: boolean): string => {
  const searchParams = new URLSearchParams();
  if (lexicalDemo) {
    searchParams.set('lexicalDemo', 'true');
  }
  const search = searchParams.toString();
  return search ? `?${search}` : '';
};

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
    return null;
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
  const lexicalDemo = params.has('lexicalDemo');
  return `${createDocumentPath(docId)}${buildSearch(lexicalDemo)}`;
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
    path: '/admin/enroll',
    element: <AdminEnrollRoute />,
    hydrateFallbackElement,
  },
  {
    path: '/',
    element: <App />,
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
    ],
  },
];

export const router = createBrowserRouter(routes);
