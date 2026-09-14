import { $isListNode } from '@lexical/list';
import type { ListItemNode } from '@lexical/list';
import { getSubtreeItems } from '#client/editor/outline/selection/tree';
import { $setNoteCheckedRaw } from './checked-state';
import { $isNoteSubtreeChecked } from './checked-subtree';

const $setNoteCheckedForSingleNode = (node: ListItemNode, checked: boolean) => {
  $setNoteCheckedRaw(node, checked);
  const parent = node.getParent();
  if ($isListNode(parent) && parent.getListType() === 'check') {
    node.setChecked(checked);
  }
};

// User-facing checklist actions always apply to a subtree so descendants match
// the toggled root.
export const $setNoteCheckedRecursively = (node: ListItemNode, checked: boolean) => {
  for (const item of getSubtreeItems(node)) {
    $setNoteCheckedForSingleNode(item, checked);
  }
};

// Toggling is one decision over the whole target set: it unchecks only when
// every target is already complete. Shared so each toggling surface agrees.
export const $toggleNoteCheckedForTargets = (targets: ListItemNode[]) => {
  const allChecked = targets.every((target) => $isNoteSubtreeChecked(target));
  for (const target of targets) {
    $setNoteCheckedRecursively(target, !allChecked);
  }
};
