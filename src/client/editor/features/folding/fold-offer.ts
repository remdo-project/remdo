import type { ListItemNode } from '@lexical/list';
import type { LexicalEditor } from 'lexical';

import { $resolveViewRoot } from '#client/editor/outline/view-root';
import { noteHasChildren } from '#client/editor/outline/selection/tree';

export function $canOfferFold(editor: LexicalEditor, note: ListItemNode): boolean {
  return noteHasChildren(note) && note.getKey() !== $resolveViewRoot(editor)?.getKey();
}
