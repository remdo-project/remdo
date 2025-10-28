import type { LexicalEditor } from 'lexical';
import { KEY_TAB_COMMAND } from 'lexical';

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
  editor.dispatchCommand(KEY_TAB_COMMAND, event);
  await Promise.resolve();
}
