import type { ListItemNode, ListType } from '@lexical/list';
import { getNestedList } from '#client/editor/outline/selection/tree';

export function $getNestedListType(contentItem: ListItemNode): ListType | null {
  return getNestedList(contentItem)?.getListType() ?? null;
}
