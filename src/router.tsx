import { createBrowserRouter, redirect } from 'react-router-dom';
import App from './App';
import { resolveSessionGateState } from './auth/client';
import { getHomeDocumentId } from './documents/user-profile';
import { HOME_USER_DOCUMENT } from './documents/defaults';
import AdminUsersRoute from './routes/AdminUsersRoute';
import DocumentRoute from './routes/DocumentRoute';
import EditorE2ERoute from './routes/EditorE2ERoute';
import LoginRoute from './routes/LoginRoute';
import { resolvePostAuthPath, resolveRememberedSessionFallbackPath } from './routes/post-auth-path';
import { config } from '#config';
import {
  createDocumentPath,
  createEditorDocumentPath,
  normalizeDocumentId,
  parseDocumentRef,
} from './routing';

const buildSearch = (lexicalDemo: boolean): string => {
  const searchParams = new URLSearchParams();
  if (lexicalDemo) {
    searchParams.set('lexicalDemo', 'true');
  }
  const search = searchParams.toString();
  return search ? `?${search}` : '';
};

function createNextSearch(request: Request): string {
  const url = new URL(request.url);
  return `?next=${encodeURIComponent(`${url.pathname}${url.search}`)}`;
}

async function requireAuthenticatedRoute(request: Request) {
  const sessionState = await resolveSessionGateState();
  if (sessionState.status !== 'unauthenticated') {
    return null;
  }

  throw redirect(`/login${createNextSearch(request)}`);
}

async function requirePublicAuthRoute(request: Request) {
  const sessionState = await resolveSessionGateState();
  if (sessionState.status === 'unauthenticated') {
    return null;
  }

  const search = new URL(request.url).search;
  if (sessionState.status === 'offline-fallback') {
    throw redirect(resolveRememberedSessionFallbackPath(search));
  }

  throw redirect(await resolvePostAuthPath(search));
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
    throw redirect(`/login${createNextSearch(request)}`);
  }
  if (sessionState.status === 'offline-fallback') {
    return HOME_USER_DOCUMENT.id;
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

    return null;
  };
};

const hydrateFallbackElement = <div aria-hidden="true" />;

const routes = [
  {
    path: '/login',
    loader: ({ request }: { request: Request }) => requirePublicAuthRoute(request),
    element: <LoginRoute />,
    hydrateFallbackElement,
  },
  {
    path: '/admin/users/new',
    element: <AdminUsersRoute />,
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
        path: 'n/:docRef',
        loader: createDocumentLoader(createDocumentPath),
        element: <DocumentRoute />,
      },
    ],
  },
  ...(config.isDevOrTest
    ? [
        {
          path: '/e2e/n/:docRef',
          loader: async ({ request, params }: { request: Request; params: { docRef?: string } }) => {
            await requireAuthenticatedRoute(request);
            return createDocumentLoader(createEditorDocumentPath)({ request, params });
          },
          element: <EditorE2ERoute />,
          hydrateFallbackElement,
        },
    ]
    : []),
];

export const router = createBrowserRouter(routes);
