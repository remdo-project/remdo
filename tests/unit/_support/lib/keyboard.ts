import type { LexicalEditor } from 'lexical';
import { act } from '@testing-library/react';
import {
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_TAB_COMMAND,
} from 'lexical';

const KEY_COMMAND_MAP = {
  Tab: { command: KEY_TAB_COMMAND, key: 'Tab' },
  Backspace: { command: KEY_BACKSPACE_COMMAND, key: 'Backspace' },
  ArrowUp: { command: KEY_ARROW_UP_COMMAND, key: 'ArrowUp' },
  ArrowDown: { command: KEY_ARROW_DOWN_COMMAND, key: 'ArrowDown' },
  ArrowLeft: { command: KEY_ARROW_LEFT_COMMAND, key: 'ArrowLeft' },
  ArrowRight: { command: KEY_ARROW_RIGHT_COMMAND, key: 'ArrowRight' },
} as const;

type SupportedKey = keyof typeof KEY_COMMAND_MAP;

interface PressKeyOptions {
  key: SupportedKey;
  shift?: boolean;
}

export async function pressKey(editor: LexicalEditor, { key, shift = false }: PressKeyOptions) {
  const mapping = KEY_COMMAND_MAP[key];

  const event = new KeyboardEvent('keydown', {
    key: mapping.key,
    bubbles: true,
    cancelable: true,
    shiftKey: shift,
  });

  await act(async () => {
    editor.dispatchCommand(mapping.command, event);
  });
}
