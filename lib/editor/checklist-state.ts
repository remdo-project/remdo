import { ListItemNode } from '@lexical/list';
import { $getState, $setState, createState } from 'lexical';

export const checklistState = createState('checkState', {
  parse: (value) => (typeof value === 'boolean' ? value : undefined),
});

export function $getNoteChecked(node: ListItemNode): boolean | undefined {
  return $getState(node, checklistState);
}

export function $setNoteChecked(node: ListItemNode, value: boolean | undefined): void {
  $setState(node, checklistState, value);
}

export function $toggleNoteChecked(node: ListItemNode): void {
  const current = $getState(node, checklistState);
  $setState(node, checklistState, current === undefined ? true : !current);
}

let didPatch = false;

export function ensureChecklistStateConfig(): void {
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
    const hasChecklistState = existing.some((entry) => {
      if (!entry || typeof entry !== 'object') {
        return false;
      }
      const keyed = entry as { stateConfig?: { key?: unknown }; key?: unknown };
      const key = keyed.stateConfig?.key ?? keyed.key;
      return key === checklistState.key;
    });

    if (!hasChecklistState) {
      listItem.stateConfigs = [...existing, { stateConfig: checklistState, flat: true }];
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
      $setState(node, checklistState, checklistState.parse(null));
    }
    return node;
  };
}

ensureChecklistStateConfig();
