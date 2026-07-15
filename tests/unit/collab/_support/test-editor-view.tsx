import { useCallback, useState } from 'react';
import Editor from '#client/editor/Editor';
import { EditorViewProvider } from '#client/editor/view/EditorViewProvider';
import type { EditorViewBindings } from '#client/editor/view/EditorViewProvider';

export function TestEditorView({
  docId,
  viewProps = {},
}: {
  docId: string;
  viewProps?: EditorViewBindings;
}) {
  const controlledZoomNoteId = viewProps.zoomNoteId;
  const [requestedZoomNoteId, setRequestedZoomNoteId] = useState<string | null>(null);
  const zoomNoteId = controlledZoomNoteId === undefined ? requestedZoomNoteId : controlledZoomNoteId;
  const handleZoomNoteIdChange = useCallback((nextZoomNoteId: string | null) => {
    if (controlledZoomNoteId === undefined) {
      setRequestedZoomNoteId(nextZoomNoteId);
    }
  }, [controlledZoomNoteId]);

  return (
    <EditorViewProvider
      docId={docId}
      onZoomNoteIdChange={handleZoomNoteIdChange}
      zoomNoteId={zoomNoteId}
    >
      <Editor docId={docId} statusPortalRoot={null} />
    </EditorViewProvider>
  );
}
