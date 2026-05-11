import { createBrowserRouter, redirect } from 'react-router-dom';
import App from './App';
import { resolveSessionGateState } from './auth/client';
import AdminUsersRoute from './routes/AdminUsersRoute';
import DocumentRoute from './routes/DocumentRoute';
import EditorE2ERoute from './routes/EditorE2ERoute';
import LoginRoute from './routes/LoginRoute';
import { config } from '#config';
import {
  createDocumentPath,
  createEditorDocumentPath,
  DEFAULT_DOC_ID,
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

function resolvePostAuthPath(request: Request): string {
  const next = new URL(request.url).searchParams.get('next');
  if (typeof next === 'string' && next.startsWith('/')) {
    return next;
  }
  return createDocumentPath(DEFAULT_DOC_ID);
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
  if (sessionState.status !== 'unauthenticated') {
    throw redirect(resolvePostAuthPath(request));
  }

  return null;
}

const redirectToDoc = (request: Request): string => {
  const url = new URL(request.url);
  const params = url.searchParams;
  const docId = normalizeDocumentId(params.get('doc')) ?? DEFAULT_DOC_ID;
  const lexicalDemo = params.has('lexicalDemo');
  return `${createDocumentPath(docId)}${buildSearch(lexicalDemo)}`;
};

type DocumentPathBuilder = (docId: string, noteId?: string | null) => string;

const createDocumentLoader = (buildPath: DocumentPathBuilder) => {
  return ({ request, params }: { request: Request; params: { docRef?: string } }) => {
    const url = new URL(request.url);
    const parsed = parseDocumentRef(params.docRef);
    if (!parsed) {
      throw redirect(`${buildPath(DEFAULT_DOC_ID)}${url.search}`);
    }

    const canonicalPath = buildPath(parsed.docId, parsed.noteId);
    if (url.pathname !== canonicalPath) {
      throw redirect(`${canonicalPath}${url.search}`);
    }

    return null;
  };
};

const routes = [
  {
    path: '/login',
    loader: ({ request }: { request: Request }) => requirePublicAuthRoute(request),
    element: <LoginRoute />,
  },
  {
    path: '/admin/users/new',
    element: <AdminUsersRoute />,
  },
  {
    path: '/',
    element: <App />,
    loader: ({ request }: { request: Request }) => requireAuthenticatedRoute(request),
    children: [
      {
        index: true,
        loader: ({ request }: { request: Request }) => {
          throw redirect(redirectToDoc(request));
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
        },
      ]
    : []),
];

export const router = createBrowserRouter(routes);
