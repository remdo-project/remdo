import { MantineProvider } from '@mantine/core';
import { act, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCollabTestDocument } from '#tests-collab/documents';
import { EditorViewProvider, useDocumentSession } from '#client/editor/view/EditorViewProvider';
import Editor from './Editor';

const hydration = vi.hoisted(() => ({ ready: false }));

vi.mock('#client/editor/runtime/collaboration/CollaborationProvider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#client/editor/runtime/collaboration/CollaborationProvider')>();
  return {
    ...actual,
    useCollaborationStatus: () => {
      const status = actual.useCollaborationStatus();
      return status.docId === 'sessionReadiness'
        ? { ...status, hydrated: hydration.ready && status.hydrated }
        : status;
    },
  };
});

vi.mock('./DevEditorSeam', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./DevEditorSeam')>();
  return {
    // Match production for this editor without disabling the harness's bridge.
    DevEditorSeam: (props: Parameters<typeof actual.DevEditorSeam>[0]) => props.session.documentId === 'sessionReadiness'
      ? null
      : <actual.DevEditorSeam {...props} />,
  };
});

/** Requests data immediately when the real host lends its session. */
function ImmediateSearchConsumer() {
  const session = useDocumentSession();
  const [result, setResult] = useState('unavailable');
  useEffect(() => {
    if (!session) {
      return;
    }
    void session.search({ query: '', limit: 10, childPreviewLimit: 2 }).then(
      ({ flatResults }) => setResult(String(flatResults.length)),
      () => setResult('failed'),
    );
  }, [session]);
  return <output data-testid="session-search-result">{result}</output>;
}

function EditorWithConsumer() {
  return (
    <MantineProvider>
      <EditorViewProvider docId="sessionReadiness" onZoomNoteIdChange={() => {}}>
        <ImmediateSearchConsumer />
        <Editor docId="sessionReadiness" statusPortalRoot={null} onSelectHome={() => {}} />
      </EditorViewProvider>
    </MantineProvider>
  );
}

beforeEach(async () => {
  await createCollabTestDocument('sessionReadiness');
});

afterEach(() => {
  hydration.ready = false;
});

describe('editor document session readiness', () => {
  it('lends a committed searchable document after hydration', async () => {
    const view = render(<EditorWithConsumer />);
    expect(screen.getByTestId('session-search-result')).toHaveTextContent('unavailable');

    act(() => {
      hydration.ready = true;
      view.rerender(<EditorWithConsumer />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('session-search-result')).toHaveTextContent('1');
    });
  });
});
