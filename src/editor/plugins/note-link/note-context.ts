import type { TextNode } from 'lexical';

import { $getNoteId } from '#lib/editor/note-id-state';
import { findNearestListItem, getContentListItem, isChildrenWrapper } from '@/editor/outline/list-structure';

export function $resolveCurrentNoteId(anchorNode: TextNode): string | null {
  const nearest = findNearestListItem(anchorNode);
  if (!nearest) {
    return null;
  }

  const contentItem = getContentListItem(nearest);
  if (isChildrenWrapper(contentItem)) {
    return null;
  }

  return $getNoteId(contentItem);
}
