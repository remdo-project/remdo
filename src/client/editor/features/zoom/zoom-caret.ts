import { $getSelection, $isRangeSelection } from 'lexical';
import type { ListItemNode } from '@lexical/list';
import { $selectItemEdge } from '#client/editor/outline/selection/caret';
import { $requireContentItemNoteId, resolveContentItemFromNode } from '#client/editor/outline/schema';
import { getFirstDescendantListItem, getNestedList, getParentContentItem, isContentDescendantOf } from '#client/editor/outline/selection/tree';
import { $findNoteById } from '#client/editor/outline/note-traversal';

type ZoomCaretPlacementResult = 'missing' | 'already-inside' | 'placed';

function $getZoomEntryTarget(root: ListItemNode): ListItemNode {
  return getFirstDescendantListItem(getNestedList(root)) ?? root;
}

/** Returning to an ancestor focuses the branch just left, including at document root. */
export function $placeCaretAtZoomExit(previousNoteId: string, nextNoteId: string | null): boolean {
  let item = $findNoteById(previousNoteId);
  while (item) {
    const parent = getParentContentItem(item);
    if ((parent ? $requireContentItemNoteId(parent) : null) === nextNoteId) {
      $selectItemEdge(item, 'start');
      return true;
    }
    item = parent;
  }
  return false;
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
