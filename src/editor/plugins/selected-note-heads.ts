import type { ListItemNode } from '@lexical/list';
import type { LexicalEditor } from 'lexical';
import { $getNodeByKey, $getSelection, $isRangeSelection } from 'lexical';
import { resolveRangeSelectionHeads } from '@/editor/outline/note-ops';
import { resolveContentItemFromNode } from '@/editor/outline/schema';

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

export function $resolveSelectedNoteHeads(editor: LexicalEditor): ListItemNode[] {
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
