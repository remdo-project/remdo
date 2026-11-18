import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';
import { registerNoteCheckedDisplay } from './checked-display';

export function NoteCheckedDisplayPlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => registerNoteCheckedDisplay(editor), [editor]);
  return null;
}
