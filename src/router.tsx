import { createBrowserRouter, redirect } from 'react-router-dom';
import App from './App';
import DocumentRoute from './routes/DocumentRoute';
import EditorE2ERoute from './routes/EditorE2ERoute';
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
    path: '/',
    element: <App />,
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
          loader: createDocumentLoader(createEditorDocumentPath),
          element: <EditorE2ERoute />,
        },
      ]
    : []),
];

export const router = createBrowserRouter(routes);
