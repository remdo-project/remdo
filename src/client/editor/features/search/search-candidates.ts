import type { NoteListType } from '#note-sdk';
import type { NotePathItem } from '#client/editor/outline/note-traversal';
import { matchesPathQuery } from '#client/search/query-match';

/** A note's render-relevant fields, used for the child preview. */
interface ChildCandidate {
  noteId: string;
  text: string;
  listType: NoteListType;
  checked: boolean;
}

/** A flat search candidate: a child candidate plus its path (ancestors + self,
 *  self last) for matching and result context. */
export interface SearchCandidate extends ChildCandidate {
  childPreview: ChildPreview;
  path: NotePathItem[];
}

/** The first few direct children of a result (for the row preview) plus the
 *  exact total direct-child count (the row shows "+N more" from the remainder). */
export interface ChildPreview {
  items: ChildCandidate[];
  totalCount: number;
}

export interface DocumentSearchResults {
  /** Matching notes in document order, capped at the requested limit. */
  flatResults: SearchCandidate[];
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

export interface SearchableNote {
  id: () => string;
  text: () => string;
  listType: () => NoteListType;
  checked: () => boolean;
  children: () => readonly SearchableNote[];
}

export interface SearchableDocument {
  children: () => readonly SearchableNote[];
}

export interface SearchableNotes {
  currentDocument: () => SearchableDocument;
}

function toChildCandidate(note: SearchableNote): ChildCandidate {
  return {
    noteId: note.id(),
    text: note.text(),
    listType: note.listType(),
    checked: note.checked(),
  };
}

interface CandidateWalkEntry {
  note: SearchableNote;
  ancestorPath: NotePathItem[];
}

/**
 * Collect the search results in a single capped, query-aware document-order
 * walk. Matching is applied inline so the walk stops once `limit` matches are
 * collected (plus a one-past peek to set `hasMore`), instead of building the
 * whole document's candidate set and slicing afterwards — the cost that makes
 * opening search on a large outline slow.
 *
 * The render-only reads (`listType`/`checked`, child previews) are taken only
 * for collected results, never for skipped or merely-peeked notes.
 */
export function collectDocumentSearchResults(
  editorNotes: SearchableNotes,
  { query, limit, childPreviewLimit }: DocumentSearchOptions,
): DocumentSearchResults {
  const flatResults: SearchCandidate[] = [];
  let hasMore = false;

  const stack: CandidateWalkEntry[] = editorNotes.currentDocument().children()
    .toReversed()
    .map((note) => ({ note, ancestorPath: [] }));

  while (stack.length > 0) {
    const { note, ancestorPath } = stack.pop()!;
    const path = [...ancestorPath, { noteId: note.id(), label: note.text() }];

    const matches = matchesPathQuery(path.map((item) => item.label), query);
    if (matches && flatResults.length === limit) {
      // One match past the limit: enough to report there are more, and the
      // signal to stop. Bail before reading this note's children — for a large
      // parent that read maps the whole nested list, a cost we'd never use since
      // the peeked match is not built into the results.
      hasMore = true;
      break;
    }

    // Children are needed for collected matches (preview) and every note's
    // traversal, so read them once here — but only past the peek-break above.
    const children = note.children();
    if (matches) {
      flatResults.push({
        ...toChildCandidate(note),
        childPreview: {
          items: children.slice(0, childPreviewLimit).map(toChildCandidate),
          totalCount: children.length,
        },
        path,
      });
    }

    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ note: children[index]!, ancestorPath: path });
    }
  }

  return { flatResults, hasMore };
}
