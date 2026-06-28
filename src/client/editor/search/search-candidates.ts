import type { EditorNote, EditorNotes, NoteListType } from '#note-sdk';
import { matchesPathQuery } from '#client/search/query-match';

/** A note's render-relevant fields, used for the child preview. */
interface ChildCandidate {
  noteId: string;
  text: string;
  listType: NoteListType;
  checked: boolean;
}

/** A flat search candidate: a child candidate plus its path labels (ancestor
 *  chain + own text, own text last) for path-scoped query matching. */
export interface SearchCandidate extends ChildCandidate {
  pathText: string[];
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
  /** Child preview keyed by result note id, built only for the shown results. */
  childPreviewByNoteId: Record<string, ChildPreview>;
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

function toChildCandidate(note: EditorNote): ChildCandidate {
  return {
    noteId: note.id(),
    text: note.text(),
    listType: note.listType(),
    checked: note.checked(),
  };
}

interface CandidateWalkEntry {
  note: EditorNote;
  ancestorLabels: string[];
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
  editorNotes: Pick<EditorNotes, 'currentDocument'>,
  { query, limit, childPreviewLimit }: DocumentSearchOptions,
): DocumentSearchResults {
  const flatResults: SearchCandidate[] = [];
  const childPreviewByNoteId: Record<string, ChildPreview> = {};
  let hasMore = false;

  const stack: CandidateWalkEntry[] = editorNotes.currentDocument().children()
    .toReversed()
    .map((note) => ({ note, ancestorLabels: [] }));

  while (stack.length > 0) {
    const { note, ancestorLabels } = stack.pop()!;
    const pathText = [...ancestorLabels, note.text()];
    const children = note.children();

    if (matchesPathQuery(pathText, query)) {
      if (flatResults.length === limit) {
        // One match past the limit: enough to report there are more, and the
        // signal to stop. This note is not built into the results — no candidate,
        // no child preview — and its children are never walked.
        hasMore = true;
        break;
      }
      flatResults.push({ ...toChildCandidate(note), pathText });
      childPreviewByNoteId[note.id()] = {
        items: children.slice(0, childPreviewLimit).map(toChildCandidate),
        totalCount: children.length,
      };
    }

    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ note: children[index]!, ancestorLabels: pathText });
    }
  }

  return { flatResults, childPreviewByNoteId, hasMore };
}
