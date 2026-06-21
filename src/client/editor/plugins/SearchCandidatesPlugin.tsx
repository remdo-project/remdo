import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect, useMemo } from 'react';
import { createLexicalEditorNotes } from '#client/editor/note-sdk-adapters';
import { useRegisterSearchNotesReader } from '#client/editor/view/EditorViewProvider';
import type { SearchNotesReader } from '#client/editor/view/EditorViewProvider';

interface SearchCandidatesPluginProps {
  docId: string;
}

// Exposes the document's notes to the search UI (which renders outside the
// composer) through the editor view provider, instead of materializing a
// snapshot. Registers a reader bound to the live editor state, and re-registers
// on each content edit so consumers recompute — the "read once per edit" refresh
// the snapshot used to provide. Unregisters on unmount.
export function SearchCandidatesPlugin({ docId }: SearchCandidatesPluginProps) {
  const [editor] = useLexicalComposerContext();
  const editorNotes = useMemo(() => createLexicalEditorNotes({ editor, docId }), [docId, editor]);
  const registerSearchNotesReader = useRegisterSearchNotesReader();

  useEffect(() => {
    const reader: SearchNotesReader = (fn) => editor.getEditorState().read(() => fn(editorNotes));
    registerSearchNotesReader(reader);

    const unregisterUpdate = editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) {
        return;
      }
      registerSearchNotesReader(reader);
    });
    const unregisterRoot = editor.registerRootListener(() => {
      registerSearchNotesReader(reader);
    });

    return () => {
      unregisterUpdate();
      unregisterRoot();
      registerSearchNotesReader(null);
    };
  }, [editor, editorNotes, registerSearchNotesReader]);

  return null;
}
