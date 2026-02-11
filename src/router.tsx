import { createBrowserRouter, redirect } from 'react-router-dom';
import App from './App';
import DocumentRoute from './routes/DocumentRoute';
import { createDocumentPath, DEFAULT_DOC_ID, normalizeDocumentId, parseDocumentRef } from './routing';

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

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      {
        index: true,
        loader: ({ request }) => {
          throw redirect(redirectToDoc(request));
        },
      },
      {
        path: 'n/:docRef',
        loader: ({ request, params }) => {
          const url = new URL(request.url);
          const parsed = parseDocumentRef(params.docRef);
          if (!parsed) {
            throw redirect(`${createDocumentPath(DEFAULT_DOC_ID)}${url.search}`);
          }

          const canonicalPath = createDocumentPath(parsed.docId, parsed.noteId);
          if (url.pathname !== canonicalPath) {
            throw redirect(`${canonicalPath}${url.search}`);
          }

          return null;
        },
        element: <DocumentRoute />,
      },
    ],
  },
]);
