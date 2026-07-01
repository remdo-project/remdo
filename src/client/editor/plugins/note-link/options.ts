import type { TextNode } from 'lexical';

import {
  $collectLinkableNotesInDocumentOrder,
  filterLinkableNotes,
  toLinkPickerOptions,
} from '#client/editor/links/note-link-index';
import type { LinkPickerOption } from '#client/editor/links/note-link-index';
import { $resolveNoteIdFromNode } from '#client/editor/outline/note-context';

export const LINK_PICKER_RESULT_LIMIT = 5;

export function $resolveLinkPickerOptions(
  query: string,
  anchorNode: TextNode,
  limit: number = LINK_PICKER_RESULT_LIMIT
): LinkPickerOption[] {
  const linkableNotes = $collectLinkableNotesInDocumentOrder();
  const currentNoteId = $resolveNoteIdFromNode(anchorNode);
  const candidates =
    currentNoteId
      ? linkableNotes.filter((note) => note.noteId !== currentNoteId)
      : linkableNotes;
  const filtered = filterLinkableNotes(candidates, query);
  return toLinkPickerOptions(filtered, limit);
}
