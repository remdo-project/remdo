import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { COMMAND_PRIORITY_LOW, KEY_TAB_COMMAND } from 'lexical';
import { useEffect } from 'react';
import { createLexicalNoteSdk } from '@/editor/outline/sdk/adapters/lexical';
import { useCollaborationStatus } from './collaboration';

export function IndentationPlugin() {
  const [editor] = useLexicalComposerContext();
  const { docId } = useCollaborationStatus();

  useEffect(() => {
    return editor.registerCommand(
      KEY_TAB_COMMAND,
      (event: KeyboardEvent) => {
        const sdk = createLexicalNoteSdk({ editor, docId });
        const { kind, range } = sdk.selection();
        if (kind === 'none') {
          return false;
        }

        event.preventDefault();

        if (event.shiftKey) {
          sdk.outdent(range);
        } else {
          sdk.indent(range);
        }

        return true;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor, docId]);

  return null;
}
