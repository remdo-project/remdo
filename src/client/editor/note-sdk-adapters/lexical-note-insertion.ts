import type { ListNode } from '@lexical/list';
import { $createListItemNode, $createListNode } from '@lexical/list';
import { $createTextNode, $setState } from 'lexical';
import type { NewNote, NoteId } from '#note-sdk';
import { createUniqueNoteId } from '#domain/notes/ids';
import { $setNoteCheckedRaw } from '#client/editor/features/list-types/checked-state';
import { noteIdState } from '#client/editor/runtime/note-ids/note-id-state';

export function hasLineBreak(notes: readonly NewNote[]): boolean {
  return notes.some((note) => /[\n\r]/.test(note.text) || hasLineBreak(note.children ?? []));
}

// Assigns IDs here rather than relying on the browser's note-ID transform, which
// headless editors do not register.
export function $appendNewNotes(list: ListNode, notes: readonly NewNote[]): NoteId[] {
  return notes.map((note) => {
    const noteId = createUniqueNoteId();
    const item = $createListItemNode();
    $setState(item, noteIdState, noteId);
    if (note.text) item.append($createTextNode(note.text));
    if (note.checked) $setNoteCheckedRaw(item, true);
    list.append(item);

    if (note.children?.length) {
      const childList = $createListNode(note.childListType ?? list.getListType());
      list.append($createListItemNode().append(childList));
      $appendNewNotes(childList, note.children);
    }
    return noteId;
  });
}
