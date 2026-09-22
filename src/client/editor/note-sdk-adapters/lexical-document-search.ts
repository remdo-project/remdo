import type { ListItemNode } from '@lexical/list';
import type { LexicalEditor } from 'lexical';
import type { DocumentSearchOptions, DocumentSearchResults, EditorNoteSnapshot } from '#note-sdk';
import { $getNoteChecked } from '#client/editor/features/list-types/checked-state';
import { $isNoteFolded } from '#client/editor/outline/fold-state';
import { getContentSiblings } from '#client/editor/outline/list-structure';
import { getNoteOwnText } from '#client/editor/outline/selection/note-body';
import { getNoteBody } from '#client/editor/outline/selection/body-region';
import { getNestedList } from '#client/editor/outline/selection/tree';
import { $requireContentItemNoteId, $resolveRootContentList } from '#client/editor/outline/schema';
import { matchesPathQuery, tokenizeQuery } from '#client/search/query-match';

interface WalkFrame {
  siblings: ListItemNode[];
  next: number;
  depth: number;
}

/**
 * Document search matches a note's body as well as its label
 * (docs/specs/outliner/search.md): a body is where a note's detail lives, so
 * text a user wrote there must be findable.
 *
 * Path scoping is unchanged — every token must still appear somewhere in the
 * note's path — but the leaf-first guard widens from "some token is in the
 * note's own text" to "some token is in its label or its body". Ancestor bodies
 * never participate, so a crumb still means where the note lives. Body matching
 * stays here rather than in the shared matcher, which the `@` link picker also
 * uses to choose link targets by label.
 */
function matchesNoteQuery(pathTexts: string[], body: string | null, query: string): boolean {
  if (matchesPathQuery(pathTexts, query)) {
    return true;
  }
  if (!body) {
    return false;
  }
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) {
    return false;
  }
  const haystack = [...pathTexts, body].map((entry) => entry.toLocaleLowerCase());
  const ownText = (pathTexts.at(-1) ?? '').toLocaleLowerCase();
  const bodyText = body.toLocaleLowerCase();
  let anyOnNote = false;
  for (const token of tokens) {
    if (!haystack.some((entry) => entry.includes(token))) {
      return false;
    }
    if (ownText.includes(token) || bodyText.includes(token)) {
      anyOnNote = true;
    }
  }
  return anyOnNote;
}

/** Search one committed state, retaining only matches and their display context. */
export function collectLexicalDocumentSearchResults(
  editor: LexicalEditor,
  { query, limit, childPreviewLimit }: DocumentSearchOptions,
): DocumentSearchResults {
  return editor.getEditorState().read(() => {
    const root = $resolveRootContentList();
    if (!root) {
      throw new Error('Missing document root list.');
    }
    const frames: WalkFrame[] = [{ siblings: getContentSiblings(root), next: 0, depth: 0 }];
    const pathNotes: ListItemNode[] = [];
    const pathTexts: string[] = [];
    const retainedRecords = new Map<ListItemNode, EditorNoteSnapshot>();
    const flatResults: DocumentSearchResults['flatResults'] = [];

    function record(note: ListItemNode): EditorNoteSnapshot {
      const previous = retainedRecords.get(note);
      if (previous) {
        return previous;
      }
      const nested = getNestedList(note);
      const value: EditorNoteSnapshot = Object.freeze({
        id: $requireContentItemNoteId(note),
        text: getNoteOwnText(note),
        body: getNoteBody(note)?.getTextContent() ?? null,
        checked: $getNoteChecked(note) === true,
        folded: $isNoteFolded(note),
        children: nested
          ? Object.freeze({
              listType: nested.getListType(),
              noteIds: Object.freeze(getContentSiblings(nested).map($requireContentItemNoteId)),
            })
          : null,
      });
      retainedRecords.set(note, value);
      return value;
    }

    while (frames.length > 0) {
      const frame = frames[frames.length - 1]!;
      const note = frame.siblings[frame.next++];
      if (!note) {
        frames.pop();
        continue;
      }

      pathNotes.length = frame.depth;
      pathTexts.length = frame.depth;
      pathNotes.push(note);
      pathTexts.push(getNoteOwnText(note));
      const matches = matchesNoteQuery(pathTexts, getNoteBody(note)?.getTextContent() ?? null, query);
      if (matches && flatResults.length === limit) {
        return { flatResults, hasMore: true };
      }

      const nested = getNestedList(note);
      const children = nested ? getContentSiblings(nested) : [];
      if (matches) {
        flatResults.push({
          note: record(note),
          childPreview: {
            notes: children.slice(0, childPreviewLimit).map(record),
            listType: nested?.getListType() ?? 'bullet',
            totalCount: children.length,
          },
          path: pathNotes.map(record),
        });
      }

      if (children.length > 0) {
        frames.push({ siblings: children, next: 0, depth: frame.depth + 1 });
      }
    }

    return { flatResults, hasMore: false };
  }, { editor });
}
