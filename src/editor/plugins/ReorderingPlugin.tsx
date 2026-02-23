import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { COMMAND_PRIORITY_LOW } from 'lexical';
import { mergeRegister } from '@lexical/utils';
import { useEffect } from 'react';
import { REORDER_NOTES_DOWN_COMMAND, REORDER_NOTES_UP_COMMAND } from '@/editor/commands';
import { createLexicalNoteSdk } from '@/editor/outline/sdk/adapters/lexical';
import { useCollaborationStatus } from './collaboration';

type MoveDirection = 'up' | 'down';

function moveSelectionViaSdk(
  editor: Parameters<typeof createLexicalNoteSdk>[0]['editor'],
  docId: string,
  direction: MoveDirection
): boolean {
  const sdk = createLexicalNoteSdk({ editor, docId });
  const heads = sdk.selection().heads();
  return direction === 'up' ? sdk.moveUp(heads) : sdk.moveDown(heads);
}

export function ReorderingPlugin() {
  const [editor] = useLexicalComposerContext();
  const { docId } = useCollaborationStatus();

  useEffect(() => {
    const $moveUp = () => moveSelectionViaSdk(editor, docId, 'up');
    const $moveDown = () => moveSelectionViaSdk(editor, docId, 'down');

    return mergeRegister(
      editor.registerCommand(REORDER_NOTES_UP_COMMAND, $moveUp, COMMAND_PRIORITY_LOW),
      editor.registerCommand(REORDER_NOTES_DOWN_COMMAND, $moveDown, COMMAND_PRIORITY_LOW)
    );
  }, [editor, docId]);

  return null;
}
