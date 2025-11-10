import type { LexicalEditor } from 'lexical';
import { act } from '@testing-library/react';
import { KEY_TAB_COMMAND, SELECT_ALL_COMMAND } from 'lexical';

export async function pressTab(
  editor: LexicalEditor,
  opts: { shift?: boolean } = {}
) {
  const { shift = false } = opts;
  const event = new KeyboardEvent('keydown', {
    key: 'Tab',
    bubbles: true,
    cancelable: true,
    shiftKey: shift,
  });
  await act(async () => {
    editor.dispatchCommand(KEY_TAB_COMMAND, event);
  });
}

export async function pressSelectAll(editor: LexicalEditor) {
  const event = new KeyboardEvent('keydown', {
    key: 'a',
    bubbles: true,
    cancelable: true,
    ctrlKey: true,
    metaKey: true,
  });
  await act(async () => {
    editor.dispatchCommand(SELECT_ALL_COMMAND, event);
  });
}
