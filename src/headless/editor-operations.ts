import type { NewNote, NoteId, NoteListType } from '#note-sdk';
import { withHeadlessOpenDocument } from './open-document';
import { renderOutline } from './outline';

/** Read without persisting normalization or linking notes whose IDs are not stored. */
export function readDocumentOutline(
  documentId: string,
  authorization: string,
  noteUrl: (noteId: NoteId) => string,
  { noteId, depth, signal }: { noteId?: NoteId | null; depth?: number; signal?: AbortSignal } = {},
): Promise<string> {
  return withHeadlessOpenDocument(documentId, authorization, async (openDocument, isStored) => renderOutline(
    noteId ? [openDocument.noteRef(noteId)] : openDocument.root.content.getChildren(),
    (id) => isStored(id) ? noteUrl(id) : null,
    { depth },
  ), { readOnly: true, signal });
}

/** Append as the credential's user, returning new direct-child IDs after durable completion. */
export function appendChildren(
  documentId: string,
  authorization: string,
  notes: readonly NewNote[],
  { noteId, signal }: { noteId?: NoteId | null; signal?: AbortSignal } = {},
): Promise<NoteId[]> {
  return withHeadlessOpenDocument(documentId, authorization, (openDocument) =>
    (noteId ? openDocument.noteRef(noteId) : openDocument.root.content).appendChildren(notes), { signal });
}

export function setChildListType(
  documentId: string,
  authorization: string,
  noteId: NoteId,
  listType: NoteListType,
  { signal }: { signal?: AbortSignal } = {},
): Promise<void> {
  return withHeadlessOpenDocument(documentId, authorization, (document) =>
    document.noteRef(noteId).setChildListType(listType), { signal });
}
