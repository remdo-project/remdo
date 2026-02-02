import { createBrowserRouter, redirect } from 'react-router-dom';
import App from './App';
import DocumentRoute from './routes/DocumentRoute';
import { DEFAULT_DOC_ID } from './routing';

const buildSearch = (zoom: string | null, lexicalDemo: boolean): string => {
  const searchParams = new URLSearchParams();
  const trimmedZoom = zoom?.trim();
  if (trimmedZoom) {
    searchParams.set('zoom', trimmedZoom);
  }
  if (lexicalDemo) {
    searchParams.set('lexicalDemo', 'true');
  }
  const search = searchParams.toString();
  return search ? `?${search}` : '';
};

const redirectToDoc = (request: Request): string => {
  const url = new URL(request.url);
  const params = url.searchParams;
  const docId = params.get('doc')?.trim() || DEFAULT_DOC_ID;
  const zoom = params.get('zoom');
  const lexicalDemo = params.has('lexicalDemo');
  return `/n/${docId}${buildSearch(zoom, lexicalDemo)}`;
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
        path: 'n/:docId',
        element: <DocumentRoute />,
      },
    ],
  },
]);
