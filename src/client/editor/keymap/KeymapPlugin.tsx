import type { LexicalEditor } from 'lexical';
import { KEY_DOWN_COMMAND, COMMAND_PRIORITY_LOW, IS_APPLE } from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';
import { REORDER_NOTES_DOWN_COMMAND, REORDER_NOTES_UP_COMMAND, SET_NOTE_CHECKED_COMMAND } from '#client/editor/foundation/commands';
import type { KeyChord } from './chords';
import { noteChordsForPlatform } from './chords';

interface KeymapEntry {
  chord: KeyChord;
  run: () => boolean;
}

function keymapForPlatform(editor: LexicalEditor, isApple: boolean): KeymapEntry[] {
  const { toggleChecked, moveDown, moveUp } = noteChordsForPlatform(isApple);
  return [
    { chord: toggleChecked, run: () => editor.dispatchCommand(SET_NOTE_CHECKED_COMMAND, { state: 'toggle' }) },
    { chord: moveDown, run: () => editor.dispatchCommand(REORDER_NOTES_DOWN_COMMAND) },
    { chord: moveUp, run: () => editor.dispatchCommand(REORDER_NOTES_UP_COMMAND) },
  ];
}

function matchesChord(event: KeyboardEvent, chord: KeyChord): boolean {
  const { key, shift = false, alt = false, ctrl = false, meta = false } = chord;
  return (
    event.key === key
    && event.shiftKey === shift
    && event.altKey === alt
    && event.ctrlKey === ctrl
    && event.metaKey === meta
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function createKeyHandler(editor: LexicalEditor, isApple: boolean) {
  const keymap = keymapForPlatform(editor, isApple);
  return (event: KeyboardEvent): boolean => {
    for (const { chord, run } of keymap) {
      if (matchesChord(event, chord)) {
        event.preventDefault();
        return run();
      }
    }
    return false;
  };
}

export function KeymapPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    // Lexical's flag picks the modifiers of its built-in shortcuts, so RemDo's chords follow it.
    const handler = createKeyHandler(editor, IS_APPLE);
    return editor.registerCommand(KEY_DOWN_COMMAND, handler, COMMAND_PRIORITY_LOW);
  }, [editor]);

  return null;
}
