import type { ListItemNode } from '@lexical/list';
import { $isListItemNode } from '@lexical/list';
import type { LexicalNode, RangeSelection } from 'lexical';
import { $autoExpandIfFolded, $isNoteFolded, $setNoteFolded } from '#client/editor/outline/fold-state';
import { $getOrCreateChildList, getNodesForNote, insertBefore } from '#client/editor/outline/list-structure';
import { resolveContentItemFromNode } from '#client/editor/outline/schema';
import { $selectItemEdge } from '#client/editor/outline/selection/caret';

export function $insertFirstChildNodes(contentItem: ListItemNode, nodes: LexicalNode[]): void {
  if (nodes.length === 0) {
    return;
  }

  $autoExpandIfFolded(contentItem);
  const childList = $getOrCreateChildList(contentItem);
  const firstChild = childList.getFirstChild();
  if (firstChild) {
    insertBefore(firstChild, nodes);
    return;
  }
  childList.append(...nodes);
}

export function $splitContentItemAtSelection(
  contentItem: ListItemNode,
  selection: RangeSelection,
  destination: 'sibling' | 'first-child' = 'sibling'
): ListItemNode | null {
  if (!selection.isCollapsed()) {
    return null;
  }

  if (resolveContentItemFromNode(selection.anchor.getNode())?.getKey() !== contentItem.getKey()) {
    return null;
  }

  const wasFolded = $isNoteFolded(contentItem);
  const trailingItem = selection.insertParagraph();
  if (!$isListItemNode(trailingItem)) {
    return null;
  }

  if (wasFolded) {
    $setNoteFolded(contentItem, false);
    $setNoteFolded(trailingItem, true);
  }

  if (destination === 'first-child') {
    const trailingNoteNodes = getNodesForNote(trailingItem);
    $insertFirstChildNodes(contentItem, trailingNoteNodes);
  }

  $selectItemEdge(trailingItem, 'start');
  return trailingItem;
}
