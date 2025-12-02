import type { LexicalCommand, LexicalEditor } from 'lexical';
import { KEY_DOWN_COMMAND, COMMAND_PRIORITY_LOW } from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';
import { mergeRegister } from '@lexical/utils';
import { MOVE_SELECTION_DOWN_COMMAND, MOVE_SELECTION_UP_COMMAND } from '@/editor/commands';
import { IS_APPLE_PLATFORM } from '@/editor/platform';

export interface KeyChord {
  key: string;
  shift?: boolean;
  alt?: boolean;
  ctrl?: boolean;
  meta?: boolean;
}

interface KeymapEntry {
  chord: KeyChord;
  command: LexicalCommand<unknown>;
}

type KeymapTable = KeymapEntry[];

function defaultsForPlatform(isApple: boolean): KeymapTable {
  return [
    {
      command: MOVE_SELECTION_DOWN_COMMAND,
      chord: {
        key: 'ArrowDown',
        shift: true,
        ctrl: isApple ? true : undefined,
        alt: isApple ? undefined : true,
      },
    },
    {
      command: MOVE_SELECTION_UP_COMMAND,
      chord: {
        key: 'ArrowUp',
        shift: true,
        ctrl: isApple ? true : undefined,
        alt: isApple ? undefined : true,
      },
    },
  ];
}

let overrides: KeymapTable | null = null;

// eslint-disable-next-line react-refresh/only-export-components
export function setKeymapOverrides(table: KeymapTable | null) {
  overrides = table;
}

function getKeymap(): KeymapTable {
  return overrides ?? defaultsForPlatform(IS_APPLE_PLATFORM);
}

function matchesChord(event: KeyboardEvent, chord: KeyChord): boolean {
  if (event.key !== chord.key) return false;
  const matches = (expected: boolean | undefined, actual: boolean) =>
    expected === undefined ? !actual : actual === expected;
  return (
    matches(chord.shift ?? false, event.shiftKey) &&
    matches(chord.alt, event.altKey) &&
    matches(chord.ctrl, event.ctrlKey) &&
    matches(chord.meta, event.metaKey)
  );
}

function createKeyHandler(editor: LexicalEditor) {
  return (event: KeyboardEvent): boolean => {
    const table = getKeymap();
    for (const { chord, command } of table) {
      if (matchesChord(event, chord)) {
        event.preventDefault();
        return editor.dispatchCommand(command, null);
      }
    }
    return false;
  };
}

export function KeymapPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const handler = createKeyHandler(editor);
    return mergeRegister(
      editor.registerCommand(KEY_DOWN_COMMAND, handler, COMMAND_PRIORITY_LOW)
    );
  }, [editor]);

  return null;
}

export default KeymapPlugin;
