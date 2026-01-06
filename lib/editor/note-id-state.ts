import { ListItemNode } from '@lexical/list';
import { $getState, $setState, createState } from 'lexical';

export const noteIdState = createState('noteId', {
  parse: (value) => (typeof value === 'string' ? value : undefined),
});

export function $getNoteId(node: ListItemNode): string | null {
  const noteId = $getState(node, noteIdState);
  return typeof noteId === 'string' && noteId.length > 0 ? noteId : null;
}

let didPatch = false;

export function ensureNoteIdStateConfig(): void {
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
    const hasNoteId = existing.some((entry) => {
      if (!entry || typeof entry !== 'object') {
        return false;
      }
      const keyed = entry as { stateConfig?: { key?: unknown }; key?: unknown };
      const key = keyed.stateConfig?.key ?? keyed.key;
      return key === noteIdState.key;
    });

    if (!hasNoteId) {
      listItem.stateConfigs = [...existing, { stateConfig: noteIdState, flat: true }];
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
      $setState(node, noteIdState, noteIdState.parse(null));
    }
    return node;
  };
}
