import { MantineProvider } from '@mantine/core';
import { act, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCollabTestDocument } from '#tests-collab/documents';
import { EditorViewProvider, useOpenDocument } from '#client/editor/view/EditorViewProvider';
import Editor from './Editor';

const hydration = vi.hoisted(() => ({ ready: false }));

vi.mock('#client/editor/runtime/collaboration/CollaborationProvider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#client/editor/runtime/collaboration/CollaborationProvider')>();
  return {
    ...actual,
    useCollaborationStatus: () => {
      const status = actual.useCollaborationStatus();
      return status.docId === 'readyOpenDocument'
        ? { ...status, hydrated: hydration.ready && status.hydrated }
        : status;
    },
  };
});

vi.mock('./DevEditorSeam', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./DevEditorSeam')>();
  return {
    // Match production for this editor without disabling the harness's bridge.
    DevEditorSeam: (props: Parameters<typeof actual.DevEditorSeam>[0]) => props.openDocument.documentId === 'readyOpenDocument'
      ? null
      : <actual.DevEditorSeam {...props} />,
  };
});

/** Requests data immediately when the real host lends its openDocument. */
function ImmediateSearchConsumer() {
  const openDocument = useOpenDocument();
  const [result, setResult] = useState('unavailable');
  useEffect(() => {
    if (!openDocument) {
      return;
    }
    void openDocument.search({ query: '', limit: 10, childPreviewLimit: 2 }).then(
      ({ flatResults }) => setResult(String(flatResults.length)),
      () => setResult('failed'),
    );
  }, [openDocument]);
  return <output data-testid="open-document-search-result">{result}</output>;
}

function EditorWithConsumer() {
  return (
    <MantineProvider>
      <EditorViewProvider docId="readyOpenDocument" onZoomNoteIdChange={() => {}}>
        <ImmediateSearchConsumer />
        <Editor docId="readyOpenDocument" statusPortalRoot={null} onSelectHome={() => {}} />
      </EditorViewProvider>
    </MantineProvider>
  );
}

beforeEach(async () => {
  await createCollabTestDocument('readyOpenDocument');
});

afterEach(() => {
  hydration.ready = false;
});

describe('editor open document readiness', () => {
  it('lends a committed searchable document after hydration', async () => {
    const view = render(<EditorWithConsumer />);
    expect(screen.getByTestId('open-document-search-result')).toHaveTextContent('unavailable');

    act(() => {
      hydration.ready = true;
      view.rerender(<EditorWithConsumer />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('open-document-search-result')).toHaveTextContent('1');
    });
  });
});
