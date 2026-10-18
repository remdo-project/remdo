import { act, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUserDataRootNote, NoteUnavailableError } from '#note-sdk';
import type { DocumentNote, OpenDocument } from '#note-sdk';
import { createCollabTestDocument } from '#tests-collab/documents';
import { EditorViewProvider, useOpenDocument } from '#client/editor/view/EditorViewProvider';
import Editor from './Editor';
import { createObservableDocumentList, TestMantineProvider } from '#tests';

const hydration = vi.hoisted(() => ({ ready: false, docId: '', generation: 0 }));

vi.mock('#client/editor/runtime/collaboration/CollaborationProvider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#client/editor/runtime/collaboration/CollaborationProvider')>();
  return {
    ...actual,
    useCollaborationStatus: () => {
      const status = actual.useCollaborationStatus();
      return status.docId === hydration.docId
        ? { ...status, hydrated: hydration.ready && status.hydrated }
        : status;
    },
  };
});

vi.mock('./DevEditorSeam', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./DevEditorSeam')>();
  return {
    // Match production for this editor without disabling the harness's bridge.
    DevEditorSeam: (props: Parameters<typeof actual.DevEditorSeam>[0]) => props.openDocument.documentId === hydration.docId
      ? null
      : <actual.DevEditorSeam {...props} />,
  };
});

/** Requests data immediately when the real host lends its openDocument. */
function ImmediateSearchConsumer({ onOpenDocument }: { onOpenDocument?: (document: OpenDocument) => void }) {
  const openDocument = useOpenDocument();
  const [result, setResult] = useState('unavailable');
  useEffect(() => {
    if (!openDocument) {
      return;
    }
    onOpenDocument?.(openDocument);
    void openDocument.search({ query: '', limit: 10, childPreviewLimit: 2 }).then(
      ({ flatResults }) => setResult(String(flatResults.length)),
      () => setResult('failed'),
    );
  }, [openDocument, onOpenDocument]);
  return <output data-testid="open-document-search-result">{result}</output>;
}

function EditorWithConsumer({ metadataNote, onOpenDocument }: {
  metadataNote?: DocumentNote;
  onOpenDocument?: (document: OpenDocument) => void;
}) {
  return (
    <TestMantineProvider>
      <EditorViewProvider docId={hydration.docId} onZoomNoteIdChange={() => {}}>
        <ImmediateSearchConsumer onOpenDocument={onOpenDocument} />
        <Editor docId={hydration.docId} metadataNote={metadataNote} statusPortalRoot={null} onSelectHome={() => {}} />
      </EditorViewProvider>
    </TestMantineProvider>
  );
}

beforeEach(async () => {
  hydration.docId = `readyOpenDocument${++hydration.generation}`;
  await createCollabTestDocument(hydration.docId);
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

  it('keeps the opened document and outline while metadata arrives and its title changes', async () => {
    const documents = createObservableDocumentList([]);
    const metadataNote = createUserDataRootNote(documents.source, {
      renameDocument: async (id, title) => { documents.replace([{ id, title }]); },
    }).documentRef(hydration.docId);
    const capture = vi.fn<(document: OpenDocument) => void>();
    hydration.ready = true;
    const view = render(<EditorWithConsumer metadataNote={metadataNote} onOpenDocument={capture} />);
    await waitFor(() => expect(capture).toHaveBeenCalled());
    const opened = capture.mock.lastCall![0];
    const root = opened.root;
    const outline = () => root.content.getChildren().map((note) => ({ id: note.getId(), text: note.getText() }));
    const before = outline();
    expect(before).toHaveLength(1);
    expect(root.getText).toThrow(NoteUnavailableError);

    act(() => documents.replace([{ id: hydration.docId, title: 'Arrived later' }]));
    view.rerender(<EditorWithConsumer metadataNote={metadataNote} onOpenDocument={capture} />);
    expect(capture.mock.lastCall![0]).toBe(opened);
    expect(root.getText()).toBe('Arrived later');
    expect(root.content.getChildren()[0]!.getParent()).toBe(root.content);

    await act(async () => { await root.rename('Renamed'); });
    view.rerender(<EditorWithConsumer metadataNote={metadataNote} onOpenDocument={capture} />);
    expect(capture.mock.lastCall![0]).toBe(opened);
    expect(opened.root).toBe(root);
    expect(root.content.getChildren()[0]!.getParent().getParent()?.getText()).toBe('Renamed');
    expect(metadataNote.getText()).toBe('Renamed');
    expect(outline()).toEqual(before);

    await act(async () => { view.unmount(); });
    expect(root.getText).toThrow(NoteUnavailableError);
    expect(metadataNote.getText()).toBe('Renamed');
    capture.mockClear();
    render(<EditorWithConsumer metadataNote={metadataNote} onOpenDocument={capture} />);
    await waitFor(() => expect(capture).toHaveBeenCalled());
    expect(capture.mock.lastCall![0]).not.toBe(opened);
    expect(capture.mock.lastCall![0].root.getText()).toBe('Renamed');
    expect(root.getText).toThrow(NoteUnavailableError);
  });
});
