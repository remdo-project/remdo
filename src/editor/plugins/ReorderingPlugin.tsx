import type { ListItemNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { LexicalEditor } from 'lexical';
import { $getNodeByKey, $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW } from 'lexical';
import { mergeRegister } from '@lexical/utils';
import { useEffect } from 'react';
import { REORDER_NOTES_DOWN_COMMAND, REORDER_NOTES_UP_COMMAND } from '@/editor/commands';
import { moveNotesDown, moveNotesUp, resolveRangeSelectionHeads } from '@/editor/outline/note-ops';
import { resolveContentItemFromNode } from '@/editor/outline/schema';
import { $resolveZoomBoundaryRoot } from '@/editor/outline/selection/boundary';

type MoveDirection = 'up' | 'down';

function $resolveContentHeadsFromKeys(keys: string[]): ListItemNode[] {
  const heads: ListItemNode[] = [];
  const seenKeys = new Set<string>();
  for (const key of keys) {
    const node = $getNodeByKey<ListItemNode>(key);
    const head = resolveContentItemFromNode(node);
    if (!head) {
      continue;
    }
    const headKey = head.getKey();
    if (seenKeys.has(headKey)) {
      continue;
    }
    seenKeys.add(headKey);
    heads.push(head);
  }
  return heads;
}

function $resolveReorderingHeads(editor: LexicalEditor): ListItemNode[] {
  if (editor.selection.isStructural()) {
    const headKeys = editor.selection.heads();
    const keys = headKeys.length > 0 ? headKeys : editor.selection.selectedKeys();
    const heads = $resolveContentHeadsFromKeys(keys);
    if (heads.length > 0) {
      return heads;
    }
  }

  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return [];
  }
  return resolveRangeSelectionHeads(selection);
}

function $moveSelection(
  editor: LexicalEditor,
  direction: MoveDirection
): boolean {
  const heads = $resolveReorderingHeads(editor);
  if (heads.length === 0) {
    return false;
  }
  const boundaryRoot = $resolveZoomBoundaryRoot(editor);
  return direction === 'up' ? moveNotesUp(heads, boundaryRoot) : moveNotesDown(heads, boundaryRoot);
}

export function ReorderingPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const $moveUp = () => $moveSelection(editor, 'up');
    const $moveDown = () => $moveSelection(editor, 'down');

    return mergeRegister(
      editor.registerCommand(REORDER_NOTES_UP_COMMAND, $moveUp, COMMAND_PRIORITY_LOW),
      editor.registerCommand(REORDER_NOTES_DOWN_COMMAND, $moveDown, COMMAND_PRIORITY_LOW)
    );
  }, [editor]);

  return null;
}
