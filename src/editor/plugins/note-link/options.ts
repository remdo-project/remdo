import type { TextNode } from 'lexical';

import {
  $collectLinkableNotesInDocumentOrder,
  filterLinkableNotes,
  toLinkPickerOptions,
} from '@/editor/links/note-link-index';
import type { LinkPickerOption } from '@/editor/links/note-link-index';
import { $resolveCurrentNoteId } from './note-context';

export const LINK_PICKER_RESULT_LIMIT = 5;

export function clampActiveIndex(activeIndex: number, optionsLength: number): number {
  if (optionsLength === 0) {
    return -1;
  }
  return Math.max(0, Math.min(activeIndex, optionsLength - 1));
}

export function $resolveLinkPickerOptions(
  query: string,
  anchorNode: TextNode,
  limit: number = LINK_PICKER_RESULT_LIMIT
): LinkPickerOption[] {
  const linkableNotes = $collectLinkableNotesInDocumentOrder();
  const currentNoteId = $resolveCurrentNoteId(anchorNode);
  const candidates =
    currentNoteId
      ? linkableNotes.filter((note) => note.noteId !== currentNoteId)
      : linkableNotes;
  const filtered = filterLinkableNotes(candidates, query);
  return toLinkPickerOptions(filtered, limit);
}
