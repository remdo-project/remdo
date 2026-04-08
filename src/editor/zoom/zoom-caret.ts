import { $getSelection, $isRangeSelection } from 'lexical';
import type { ListItemNode } from '@lexical/list';
import { $selectItemEdge } from '@/editor/outline/selection/caret';
import { resolveContentItemFromNode } from '@/editor/outline/schema';
import { getFirstDescendantListItem, getNestedList, isContentDescendantOf } from '@/editor/outline/selection/tree';
import { $findNoteById } from '@/editor/outline/note-traversal';

type ZoomCaretPlacementResult = 'missing' | 'already-inside' | 'placed';

function $getZoomEntryTarget(root: ListItemNode): ListItemNode {
  return getFirstDescendantListItem(getNestedList(root)) ?? root;
}

export function $placeCaretAtZoomEntry(noteId: string): ZoomCaretPlacementResult {
  const targetItem = $findNoteById(noteId);
  if (!targetItem) {
    return 'missing';
  }
  $selectItemEdge($getZoomEntryTarget(targetItem), 'start');
  return 'placed';
}

export function $placeCaretAtZoomEntryIfOutside(noteId: string): ZoomCaretPlacementResult {
  const targetItem = $findNoteById(noteId);
  if (!targetItem) {
    return 'missing';
  }

  const selection = $getSelection();
  const selectionItem = $isRangeSelection(selection)
    ? resolveContentItemFromNode(selection.anchor.getNode())
    : null;
  if (selectionItem && isContentDescendantOf(selectionItem, targetItem)) {
    return 'already-inside';
  }

  $selectItemEdge($getZoomEntryTarget(targetItem), 'start');
  return 'placed';
}
