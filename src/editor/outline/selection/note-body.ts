import type { ListItemNode } from '@lexical/list';
import { $isListNode } from '@lexical/list';

import { getContentListItem } from '@/editor/outline/list-structure';

export function isEmptyNoteBody(item: ListItemNode): boolean {
  const contentItem = getContentListItem(item);
  const pieces: string[] = [];

  for (const child of contentItem.getChildren()) {
    if ($isListNode(child)) {
      continue;
    }
    const getTextContent = (child as { getTextContent?: () => string }).getTextContent;
    if (typeof getTextContent === 'function') {
      pieces.push(getTextContent.call(child));
    }
  }

  return pieces.join('').trim().length === 0;
}
