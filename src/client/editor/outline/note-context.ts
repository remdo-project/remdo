import type { ListItemNode } from '@lexical/list';
import { $getNearestNodeFromDOMNode } from 'lexical';
import type { LexicalEditor, LexicalNode } from 'lexical';

import {
  $requireContentItemNoteId,
  resolveContentItemFromNode,
} from './schema';
import { $resolveNoteForSelectionPoint } from '#client/editor/features/note-body/note-body-ops';

export function $resolveContentNoteFromDOMNode(node: Node | null): ListItemNode | null {
  if (!node) {
    return null;
  }
  return resolveContentItemFromNode($getNearestNodeFromDOMNode(node));
}

// The Lexical key of the focus note: the outline selection's focus, falling back
// to the DOM selection's focus/anchor. Call inside editor.read/update.
export function $resolveFocusNoteKey(editor: LexicalEditor): string | null {
  const focusKey = editor.selection.get()?.focusKey;
  if (focusKey) {
    return focusKey;
  }
  const domSelection = globalThis.getSelection();
  const focusNode = domSelection?.focusNode ?? domSelection?.anchorNode ?? null;
  return $resolveContentNoteFromDOMNode(focusNode)?.getKey() ?? null;
}

export function $resolveNoteIdFromNode(node: LexicalNode | null): string | null {
  // A node inside a body belongs to that body's owner note (body content behaves
  // like note content — e.g. an `@` link typed in a body resolves to its note,
  // so the picker can exclude that note and avoid a self-link).
  const contentItem = $resolveNoteForSelectionPoint(node);
  if (!contentItem) {
    return null;
  }
  return $requireContentItemNoteId(contentItem);
}

export function $resolveNoteIdFromDOMNode(node: Node | null): string | null {
  if (!node) {
    return null;
  }
  return $resolveNoteIdFromNode($getNearestNodeFromDOMNode(node));
}
