import { ListItemNode } from '@lexical/list';
import { $getState, $setState, createState } from 'lexical';

export const foldedState = createState('folded', {
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

  const originalConfig = ListItemNode.prototype.$config;
  ListItemNode.prototype.$config = function patchedConfig(this: ListItemNode) {
    const record = originalConfig.call(this);
    const listItemConfig = record.listitem;
    if (!listItemConfig) {
      return record;
    }

    const listItem = listItemConfig as typeof listItemConfig & { stateConfigs?: unknown };
    const existing = Array.isArray(listItem.stateConfigs) ? listItem.stateConfigs : [];
    const hasFolded = existing.some((entry) => {
      if (!entry || typeof entry !== 'object') {
        return false;
      }
      const keyed = entry as { stateConfig?: { key?: unknown }; key?: unknown };
      const key = keyed.stateConfig?.key ?? keyed.key;
      return key === foldedState.key;
    });

    if (!hasFolded) {
      listItem.stateConfigs = [...existing, { stateConfig: foldedState, flat: true }];
    }

    return record;
  };

  const originalInsertNewAfter = ListItemNode.prototype.insertNewAfter;
  ListItemNode.prototype.insertNewAfter = function $patchedInsertNewAfter(
    this: ListItemNode,
    selection: Parameters<ListItemNode['insertNewAfter']>[0],
    restoreSelection?: Parameters<ListItemNode['insertNewAfter']>[1]
  ) {
    const node = originalInsertNewAfter.call(this, selection, restoreSelection);
    if (node instanceof ListItemNode) {
      $setState(node, foldedState, foldedState.parse(null));
    }
    return node;
  };
}

ensureFoldStateConfig();
