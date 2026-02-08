import type { ListItemNode } from '@lexical/list';
import { $getState, $setState, createState } from 'lexical';
import { patchListItemStateConfig } from './list-item-state-config';

const foldedState = createState('folded', {
  parse: (value) => (value === true ? true : undefined),
});

export function $isNoteFolded(node: ListItemNode): boolean {
  return $getState(node, foldedState) === true;
}

export function $setNoteFolded(node: ListItemNode, folded: boolean): void {
  $setState(node, foldedState, folded ? true : foldedState.parse(null));
}

export function $autoExpandIfFolded(node: ListItemNode): void {
  if ($isNoteFolded(node)) {
    $setNoteFolded(node, false);
  }
}

let didPatch = false;

export function ensureFoldStateConfig(): void {
  if (didPatch) {
    return;
  }
  didPatch = true;
  patchListItemStateConfig(foldedState);
}

ensureFoldStateConfig();
