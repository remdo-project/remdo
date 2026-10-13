import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $addUpdateTag, $onUpdate, COMMAND_PRIORITY_LOW, HISTORY_PUSH_TAG, SET_TEXT_FORMAT_COMMAND } from 'lexical';
import { useEffect } from 'react';
import { TOGGLE_INLINE_FORMAT_COMMAND } from '#client/editor/foundation/commands';
import { stopHistoryCapture } from '#client/editor/runtime/history';
import { $readInlineFormatTarget } from './selection';

export function InlineFormattingPlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => editor.registerCommand(TOGGLE_INLINE_FORMAT_COMMAND, ({ format, fingerprint }) => {
    const target = $readInlineFormatTarget(editor);
    if (!target || (fingerprint !== undefined && fingerprint !== target.fingerprint)) return false;
    stopHistoryCapture(editor);
    $addUpdateTag(HISTORY_PUSH_TAG);
    editor.dispatchCommand(SET_TEXT_FORMAT_COMMAND, { [format]: target.states[format] !== 'all' });
    $onUpdate(() => stopHistoryCapture(editor));
    return true;
  }, COMMAND_PRIORITY_LOW), [editor]);
  return null;
}
