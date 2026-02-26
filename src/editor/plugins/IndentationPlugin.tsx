import type { ListItemNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { LexicalEditor } from 'lexical';
import { $getNodeByKey, $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW, KEY_TAB_COMMAND } from 'lexical';
import { useEffect } from 'react';
import { indentNotes, outdentNotes, resolveRangeSelectionHeads } from '@/editor/outline/note-ops';
import { resolveContentItemFromNode } from '@/editor/outline/schema';
import { $resolveZoomBoundaryRoot } from '@/editor/outline/selection/boundary';

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

function $resolveIndentationHeads(editor: LexicalEditor): ListItemNode[] {
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

export function IndentationPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_TAB_COMMAND,
      (event: KeyboardEvent) => {
        const heads = $resolveIndentationHeads(editor);
        if (heads.length === 0) {
          return false;
        }

        event.preventDefault();
        const boundaryRoot = $resolveZoomBoundaryRoot(editor);

        if (event.shiftKey) {
          outdentNotes(heads, boundaryRoot);
        } else {
          indentNotes(heads, boundaryRoot);
        }

        return true;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor]);

  return null;
}
