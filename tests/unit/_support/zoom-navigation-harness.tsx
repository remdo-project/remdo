import { MantineProvider } from '@mantine/core';
import { act, render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { createDocumentPath, parseDocumentRef } from '#document-routes';
import { getTestBridgeRegistry } from '#client/editor/dev/testBridgeRegistry';
import { readFixture } from '#tools/fixtures';
import { getTestUserData } from '#tests';
import DocumentRoute from '#client/app/workspace/DocumentRoute';
import Home from '#client/app/workspace/Home';
import { createCollabTestDocument } from '../collab/_support/documents';

// Keep the real router, workspace, and editor together: these races cross all
// three boundaries. Only route completion is held, without relying on timers.
export async function renderZoomNavigation(initialNoteId: string | null = 'note1') {
  const docId = (await getTestUserData().getDocuments().create('Navigation')).getId();
  await createCollabTestDocument(docId);
  let pendingRoute: { noteId: string | null; promise: Promise<void> } | undefined;
  const loader = async (noteId: string | null) => {
    if (pendingRoute?.noteId === noteId) {
      await pendingRoute.promise;
    }
    return { docId, noteId };
  };
  const router = createMemoryRouter([
    {
      path: '/',
      element: <Home />,
    },
    {
      path: '/n/:docRef',
      element: <DocumentRoute />,
      hydrateFallbackElement: <div />,
      loader: ({ params }) => loader(parseDocumentRef(params.docRef)!.noteId),
    },
  ], { initialEntries: [createDocumentPath(docId)] });
  const nextEditor = getTestBridgeRegistry().waitForNext();
  render(<MantineProvider><RouterProvider router={router} /></MantineProvider>);
  const api = await nextEditor;
  await api._bridge.waitForCollaborationReady();
  await act(async () => {
    await api._bridge.applySerializedState(await readFixture('tree-complex'));
    if (initialNoteId !== null) {
      await router.navigate(createDocumentPath(docId, initialNoteId));
    }
  });
  return {
    api,
    docId,
    router,
    holdRoute(noteId: string | null) {
      let release!: () => void;
      const promise = new Promise<void>((resolve) => { release = resolve; });
      pendingRoute = { noteId, promise };
      return release;
    },
  };
}
