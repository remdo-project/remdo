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

type KeymapPatch = Map<LexicalCommand<unknown>, KeyChord[]>;

let overrides: KeymapPatch = new Map();

// eslint-disable-next-line react-refresh/only-export-components
export function clearKeymapOverrides() {
  overrides = new Map();
}

// eslint-disable-next-line react-refresh/only-export-components
export function setKeymapOverrides(patch: KeymapPatch) {
  overrides = new Map(patch);
}

function getKeymap(): KeymapTable {
  const base = defaultsForPlatform(IS_APPLE_PLATFORM);
  return base.flatMap((entry) => {
    const override = overrides.get(entry.command);
    if (!override || override.length === 0) {
      return entry;
    }
    return override.map((chord) => ({ command: entry.command, chord }));
  });
}

function matchesChord(event: KeyboardEvent, chord: KeyChord): boolean {
  const { key, shift = false, alt = false, ctrl = false, meta = false } = chord;
  return (
    event.key === key &&
    event.shiftKey === shift &&
    event.altKey === alt &&
    event.ctrlKey === ctrl &&
    event.metaKey === meta
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

// eslint-disable-next-line react-refresh/only-export-components
export const __testCreateKeyHandler = createKeyHandler;

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
