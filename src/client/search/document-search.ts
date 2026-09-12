import type { DocumentSnapshot, EditorNoteSnapshot, NoteId, NoteListType } from '#note-sdk';
import { matchesPathQuery } from './query-match';

/** A matching SDK note plus its path (ancestors + self, self last). */
export interface SearchResult {
  note: EditorNoteSnapshot;
  childPreview: ChildPreview;
  path: readonly EditorNoteSnapshot[];
}

/** The first few direct children plus the exact direct-child count. */
export interface ChildPreview {
  notes: readonly EditorNoteSnapshot[];
  listType: NoteListType;
  totalCount: number;
}

export interface DocumentSearchResults {
  /** Matching notes in document order, capped at the requested limit. */
  flatResults: SearchResult[];
  /** True when at least one match exists beyond the returned results. */
  hasMore: boolean;
}

export interface DocumentSearchOptions {
  query: string;
  /** Maximum number of matching results to return. */
  limit: number;
  /** Maximum direct children to include in each result's preview. */
  childPreviewLimit: number;
}

interface CandidateWalkEntry {
  noteId: NoteId;
  ancestorPath: readonly EditorNoteSnapshot[];
}

function requireNote(document: DocumentSnapshot, noteId: NoteId): EditorNoteSnapshot {
  const note = document.notes.get(noteId);
  if (!note) {
    throw new Error(`Document snapshot references missing note: ${noteId}`);
  }
  return note;
}

/**
 * Collect search results in one capped, query-aware document-order walk.
 * Matching stops after one result beyond `limit`; the SDK snapshot itself is
 * already coherent and indexed, so this function owns no editor transaction or
 * observation mechanics.
 */
export function collectDocumentSearchResults(
  document: DocumentSnapshot,
  { query, limit, childPreviewLimit }: DocumentSearchOptions,
): DocumentSearchResults {
  const flatResults: SearchResult[] = [];
  let hasMore = false;

  const stack: CandidateWalkEntry[] = document.root.noteIds
    .toReversed()
    .map((noteId) => ({ noteId, ancestorPath: [] }));

  while (stack.length > 0) {
    const { noteId, ancestorPath } = stack.pop()!;
    const note = requireNote(document, noteId);
    const path = [...ancestorPath, note];
    const matches = matchesPathQuery(path.map((item) => item.text), query);

    if (matches && flatResults.length === limit) {
      hasMore = true;
      break;
    }

    const children = note.children;
    if (matches) {
      flatResults.push({
        note,
        childPreview: {
          notes: children
            ? children.noteIds
                .slice(0, childPreviewLimit)
                .map((childId) => requireNote(document, childId))
            : [],
          totalCount: children?.noteIds.length ?? 0,
          listType: children?.listType ?? 'bullet',
        },
        path,
      });
    }

    if (!children) {
      continue;
    }
    for (let index = children.noteIds.length - 1; index >= 0; index -= 1) {
      stack.push({
        noteId: children.noteIds[index]!,
        ancestorPath: path,
      });
    }
  }

  return { flatResults, hasMore };
}
