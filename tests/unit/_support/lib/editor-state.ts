import type { SerializedEditorState } from 'lexical';

export function withRootNoteId(editorState: SerializedEditorState, noteId: string): SerializedEditorState {
  type RootWithNoteId = SerializedEditorState['root'] & { noteId: string };
  const rootWithNoteId: RootWithNoteId = {
    ...editorState.root,
    noteId,
  };

  return {
    ...editorState,
    root: rootWithNoteId,
  };
}
