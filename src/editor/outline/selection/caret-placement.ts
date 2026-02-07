import type { ListItemNode } from '@lexical/list';
import type { BaseSelection } from 'lexical';
import { $isRangeSelection } from 'lexical';

import { isPointAtBoundary } from './caret';

export type CaretPlacement = 'start' | 'middle' | 'end';

export function resolveCaretPlacement(
  selection: BaseSelection | null,
  contentItem: ListItemNode
): CaretPlacement | null {
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return null;
  }

  if (contentItem.getTextContent().length === 0) {
    return 'start';
  }

  if (isPointAtBoundary(selection.anchor, contentItem, 'start')) {
    return 'start';
  }

  if (isPointAtBoundary(selection.anchor, contentItem, 'end')) {
    return 'end';
  }

  return 'middle';
}
