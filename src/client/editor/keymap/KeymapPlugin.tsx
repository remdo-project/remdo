import type { LexicalEditor } from 'lexical';
import { KEY_DOWN_COMMAND, COMMAND_PRIORITY_LOW, IS_APPLE, isExactShortcutMatch } from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';
import { REORDER_NOTES_DOWN_COMMAND, REORDER_NOTES_UP_COMMAND, SET_NOTE_CHECKED_COMMAND, TOGGLE_INLINE_FORMAT_COMMAND } from '#client/editor/foundation/commands';
import { hasNativeEditorSelection } from '#client/editor/foundation/editor-focus';
import type { KeyChord } from './chords';
import { noteChordsForPlatform } from './chords';

interface KeymapEntry {
  chord: KeyChord;
  run: (event: KeyboardEvent) => boolean;
  preventDefaultOnMatch?: boolean;
}

function keymapForPlatform(editor: LexicalEditor, isApple: boolean): KeymapEntry[] {
  const { toggleChecked, moveDown, moveUp } = noteChordsForPlatform(isApple);
  return [
    { chord: toggleChecked, run: () => editor.dispatchCommand(SET_NOTE_CHECKED_COMMAND, { state: 'toggle' }) },
    { chord: moveDown, run: () => editor.dispatchCommand(REORDER_NOTES_DOWN_COMMAND) },
    { chord: moveUp, run: () => editor.dispatchCommand(REORDER_NOTES_UP_COMMAND) },
    {
      chord: { key: 'e', meta: isApple, ctrl: !isApple },
      run: event => !event.isComposing && hasNativeEditorSelection(editor.getRootElement())
        && editor.dispatchCommand(TOGGLE_INLINE_FORMAT_COMMAND, { format: 'code' }),
      preventDefaultOnMatch: false,
    },
  ];
}

function matchesChord(event: KeyboardEvent, chord: KeyChord): boolean {
  const { key, shift = false, alt = false, ctrl = false, meta = false } = chord;
  return isExactShortcutMatch(event, key, { shiftKey: shift, altKey: alt, ctrlKey: ctrl, metaKey: meta });
}

// eslint-disable-next-line react-refresh/only-export-components
export function createKeyHandler(editor: LexicalEditor, isApple: boolean) {
  const keymap = keymapForPlatform(editor, isApple);
  return (event: KeyboardEvent): boolean => {
    for (const { chord, run, preventDefaultOnMatch = true } of keymap) {
      if (matchesChord(event, chord)) {
        const handled = run(event);
        if (handled || preventDefaultOnMatch) event.preventDefault();
        return handled;
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
