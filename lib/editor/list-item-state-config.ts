import { ListItemNode } from '@lexical/list';
import { $setState } from 'lexical';

export interface ListItemStateConfig<Value> {
  key: string;
  parse: (value: unknown) => Value;
}

export function patchListItemStateConfig<Value>(stateConfig: ListItemStateConfig<Value>): void {
  const originalConfig = ListItemNode.prototype.$config;
  ListItemNode.prototype.$config = function patchedConfig(this: ListItemNode) {
    const record = originalConfig.call(this);
    const listItemConfig = record.listitem;
    if (!listItemConfig) {
      return record;
    }

    const listItem = listItemConfig as typeof listItemConfig & { stateConfigs?: unknown };
    const existing = Array.isArray(listItem.stateConfigs) ? listItem.stateConfigs : [];
    const hasStateConfig = existing.some((entry) => {
      if (!entry || typeof entry !== 'object') {
        return false;
      }
      const keyed = entry as { stateConfig?: { key?: unknown }; key?: unknown };
      const key = keyed.stateConfig?.key ?? keyed.key;
      return key === stateConfig.key;
    });

    if (!hasStateConfig) {
      listItem.stateConfigs = [...existing, { stateConfig, flat: true }];
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
      $setState(node, stateConfig as never, stateConfig.parse(null) as never);
    }
    return node;
  };
}
