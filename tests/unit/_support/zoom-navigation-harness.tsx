import { MantineProvider } from '@mantine/core';
import { act, render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { createDocumentPath, parseDocumentRef } from '#document-routes';
import { getTestBridgeRegistry } from '#client/editor/dev/testBridgeRegistry';
import { readFixture } from '#tools/fixtures';
import DocumentRoute from '#client/app/workspace/DocumentRoute';

// Keep the real router, workspace, and editor together: these races cross all
// three boundaries. Only route completion is held, without relying on timers.
export async function renderZoomNavigation(initialNoteId: string | null = 'note1') {
  let pendingRoute: { noteId: string | null; promise: Promise<void> } | undefined;
  const loader = async (noteId: string | null) => {
    if (pendingRoute?.noteId === noteId) {
      await pendingRoute.promise;
    }
    return { docId: 'testDoc', noteId, homeDocumentId: 'testDoc' };
  };
  const router = createMemoryRouter([
    {
      path: '/',
      element: <DocumentRoute />,
      hydrateFallbackElement: <div />,
      loader: () => loader(null),
    },
    {
      path: '/n/:docRef',
      element: <DocumentRoute />,
      hydrateFallbackElement: <div />,
      loader: ({ params }) => loader(parseDocumentRef(params.docRef)!.noteId),
    },
  ], { initialEntries: ['/'] });
  const nextEditor = getTestBridgeRegistry().waitForNext();
  render(<MantineProvider><RouterProvider router={router} /></MantineProvider>);
  const api = await nextEditor;
  await act(async () => {
    await api._bridge.applySerializedState(await readFixture('tree-complex'));
    if (initialNoteId !== null) {
      await router.navigate(createDocumentPath('testDoc', initialNoteId));
    }
  });
  return {
    api,
    router,
    holdRoute(noteId: string | null) {
      let release!: () => void;
      const promise = new Promise<void>((resolve) => { release = resolve; });
      pendingRoute = { noteId, promise };
      return release;
    },
  };
}

