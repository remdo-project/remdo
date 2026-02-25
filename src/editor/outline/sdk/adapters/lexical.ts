import type { LexicalEditor, LexicalNode } from 'lexical';
import { $getNodeByKey, $getSelection, $isRangeSelection } from 'lexical';
import {
  $getOrCreateChildList,
  flattenNoteNodes,
  getContentSiblings,
  getNodesForNote,
  insertAfter,
  insertBefore,
  isChildrenWrapper,
  maybeRemoveEmptyWrapper,
} from '@/editor/outline/list-structure';
import { indentNotes, moveNotesDown, moveNotesUp, outdentNotes } from '@/editor/outline/note-ops';
import { $findNoteById } from '@/editor/outline/note-traversal';
import { $requireContentItemNoteId, resolveContentItemFromNode } from '@/editor/outline/schema';
import { $resolveZoomBoundaryRoot, isWithinZoomBoundary } from '@/editor/outline/selection/boundary';
import { getContiguousSelectionHeads, getSelectedNotes } from '@/editor/outline/selection/heads';
import {
  getNestedList,
  isContentDescendantOf,
  removeNoteSubtree,
  sortHeadsByDocumentOrder,
} from '@/editor/outline/selection/tree';
import { createNoteSdk } from '../core';
import type { AdapterNoteSelection, MoveTarget, NoteId, NoteSdk, NoteSdkAdapter } from '../contracts';
import { NoteNotFoundError } from '../errors';
import type { ListItemNode, ListNode } from '@lexical/list';
import { $isListItemNode, $isListNode } from '@lexical/list';

export interface LexicalNoteSdkAdapterOptions {
  editor: LexicalEditor;
  docId: string;
}

export function createLexicalNoteSdkAdapter({ editor, docId }: LexicalNoteSdkAdapterOptions): NoteSdkAdapter {
  type MoveInsertionTarget =
    | { kind: 'before'; reference: LexicalNode }
    | { kind: 'after'; reference: LexicalNode }
    | { kind: 'append'; list: ListNode };

  const $resolveNoteById = (noteId: NoteId) => $findNoteById(noteId);
  const $requireNoteById = (noteId: NoteId): ListItemNode => {
    const note = $resolveNoteById(noteId);
    if (!note) {
      throw new NoteNotFoundError(noteId);
    }
    return note;
  };
  const $resolveBoundaryRoot = () => $resolveZoomBoundaryRoot(editor);
  const $requireNotesByIds = (noteIds: readonly NoteId[]): ListItemNode[] => {
    return noteIds.map((noteId) => $requireNoteById(noteId));
  };
  const $normalizeInsertionSlot = (index: number, size: number): number => {
    if (index >= 0) {
      return Math.min(index, size);
    }
    return Math.max(0, Math.min(size, size + index + 1));
  };
  const $assertMoveHeads = (notes: readonly ListItemNode[]): void => {
    const seen = new Set<string>();
    for (const note of notes) {
      const key = note.getKey();
      if (seen.has(key)) {
        throw new Error('move() expects unique note heads');
      }
      seen.add(key);
    }

    for (let i = 0; i < notes.length; i += 1) {
      const left = notes[i];
      if (!left) {
        continue;
      }
      for (let j = i + 1; j < notes.length; j += 1) {
        const right = notes[j];
        if (!right) {
          continue;
        }
        if (isContentDescendantOf(left, right) || isContentDescendantOf(right, left)) {
          throw new Error('move() expects head notes only (no ancestor/descendant overlap)');
        }
      }
    }
  };
  const $resolveContiguousRun = (
    notes: readonly ListItemNode[],
    siblings: readonly ListItemNode[]
  ): { start: number; end: number } | null => {
    const indexes = notes.map((note) => siblings.indexOf(note));
    if (indexes.includes(-1)) {
      return null;
    }

    const sortedIndexes = indexes.toSorted((left, right) => left - right);
    const start = sortedIndexes[0];
    const end = sortedIndexes.at(-1);
    if (start === undefined || end === undefined) {
      return null;
    }

    if (end - start + 1 !== notes.length) {
      return null;
    }

    if (!indexes.every((index, position) => index === start + position)) {
      return null;
    }

    return { start, end };
  };
  const $resolveMoveInsertionTarget = (
    target: MoveTarget<NoteId>,
    movedNotes: readonly ListItemNode[],
    boundaryRoot: ListItemNode | null
  ): MoveInsertionTarget | null => {
    const movedKeys = new Set(movedNotes.map((note) => note.getKey()));
    const isInsideMovedSubtree = (candidate: ListItemNode): boolean =>
      movedNotes.some((note) => isContentDescendantOf(candidate, note));

    if ('before' in target) {
      const sibling = $requireNoteById(target.before);
      if (!isWithinZoomBoundary(sibling, boundaryRoot)) {
        return null;
      }
      if (movedKeys.has(sibling.getKey())) {
        return null;
      }
      if (isInsideMovedSubtree(sibling)) {
        throw new Error('Cannot move notes relative to their own descendants');
      }

      const siblingParent = sibling.getParent();
      if ($isListNode(siblingParent)) {
        const siblings = getContentSiblings(siblingParent);
        const run = $resolveContiguousRun(movedNotes, siblings);
        const siblingIndex = siblings.indexOf(sibling);
        if (run && siblingIndex === run.end + 1) {
          return null;
        }
      }
      return { kind: 'before', reference: sibling };
    }

    if ('after' in target) {
      const sibling = $requireNoteById(target.after);
      if (!isWithinZoomBoundary(sibling, boundaryRoot)) {
        return null;
      }
      if (movedKeys.has(sibling.getKey())) {
        return null;
      }
      if (isInsideMovedSubtree(sibling)) {
        throw new Error('Cannot move notes relative to their own descendants');
      }

      const siblingParent = sibling.getParent();
      if ($isListNode(siblingParent)) {
        const siblings = getContentSiblings(siblingParent);
        const run = $resolveContiguousRun(movedNotes, siblings);
        const siblingIndex = siblings.indexOf(sibling);
        if (run && siblingIndex === run.start - 1) {
          return null;
        }
      }

      const siblingNodes = getNodesForNote(sibling);
      const siblingTail = siblingNodes.at(-1);
      if (!siblingTail) {
        return null;
      }
      return { kind: 'after', reference: siblingTail };
    }

    const parent = $requireNoteById(target.parent);
    if (!isWithinZoomBoundary(parent, boundaryRoot)) {
      return null;
    }
    if (isInsideMovedSubtree(parent)) {
      throw new Error('Cannot move notes into their own subtree');
    }

    const targetList = $getOrCreateChildList(parent);
    const availableSiblings = getContentSiblings(targetList).filter((sibling) => !movedKeys.has(sibling.getKey()));
    const slot = $normalizeInsertionSlot(target.index, availableSiblings.length);
    const anchor = availableSiblings[slot];
    if (!anchor) {
      return { kind: 'append', list: targetList };
    }
    return { kind: 'before', reference: anchor };
  };
  const $moveNotes = (noteIds: readonly NoteId[], target: MoveTarget<NoteId>): boolean => {
    if (noteIds.length === 0) {
      return false;
    }

    const notes = $requireNotesByIds(noteIds);
    const boundaryRoot = $resolveBoundaryRoot();
    if (!notes.every((note) => isWithinZoomBoundary(note, boundaryRoot))) {
      return false;
    }

    $assertMoveHeads(notes);

    const insertion = $resolveMoveInsertionTarget(target, notes, boundaryRoot);
    if (!insertion) {
      return false;
    }

    const sourceLists = new Map<string, ListNode>();
    for (const note of notes) {
      const parent = note.getParent();
      if ($isListNode(parent)) {
        sourceLists.set(parent.getKey(), parent);
      }
    }

    const nodesToMove = flattenNoteNodes(notes);
    if (insertion.kind === 'append') {
      insertion.list.append(...nodesToMove);
    } else if (insertion.kind === 'before') {
      insertBefore(insertion.reference, nodesToMove);
    } else {
      insertAfter(insertion.reference, nodesToMove);
    }

    for (const list of sourceLists.values()) {
      maybeRemoveEmptyWrapper(list);
    }

    return true;
  };

  const $selectionFallbackFromRange = (): AdapterNoteSelection => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      return { kind: 'none', heads: [] };
    }

    if (!selection.isCollapsed()) {
      const heads = getContiguousSelectionHeads(selection).map((head) => $requireContentItemNoteId(head));
      const hasMultiNoteSelection = getSelectedNotes(selection).length > 1;
      if ((heads.length > 1 || hasMultiNoteSelection) && heads.length > 0) {
        return { kind: 'structural', heads };
      }
    }

    const item = resolveContentItemFromNode(selection.focus.getNode()) ??
      resolveContentItemFromNode(selection.anchor.getNode());
    if (!item) {
      return { kind: 'none', heads: [] };
    }

    const noteId = $requireContentItemNoteId(item);
    return selection.isCollapsed() ? { kind: 'caret', heads: [noteId] } : { kind: 'inline', heads: [noteId] };
  };

  const $noteIdFromContentKey = (key: string): NoteId | null => {
    const node = $getNodeByKey<ListItemNode>(key);
    if (!$isListItemNode(node) || isChildrenWrapper(node) || !node.isAttached()) {
      return null;
    }
    return $requireContentItemNoteId(node);
  };

  const $adapterSelection = (): AdapterNoteSelection => {
    const outlineSelection = editor.selection.get();
    if (!outlineSelection) {
      return $selectionFallbackFromRange();
    }

    if (outlineSelection.kind === 'structural') {
      const keys =
        outlineSelection.headKeys.length > 0 ? outlineSelection.headKeys : outlineSelection.selectedKeys;
      const heads = keys
        .map((key) => $noteIdFromContentKey(key))
        .filter((noteId): noteId is NoteId => noteId !== null);
      return heads.length > 0 ? { kind: 'structural', heads } : { kind: 'none', heads: [] };
    }

    const key = outlineSelection.focusKey ?? outlineSelection.anchorKey;
    if (!key) {
      return $selectionFallbackFromRange();
    }
    const noteId = $noteIdFromContentKey(key);
    if (!noteId) {
      return { kind: 'none', heads: [] };
    }
    return outlineSelection.kind === 'inline' ? { kind: 'inline', heads: [noteId] } : { kind: 'caret', heads: [noteId] };
  };

  return {
    docId: () => docId,
    selection: () => $adapterSelection(),
    hasNote: (noteId) => Boolean($resolveNoteById(noteId)),
    textOf: (noteId) => $requireNoteById(noteId).getTextContent(),
    childrenOf: (noteId) => {
      const current = $requireNoteById(noteId);

      const nested = getNestedList(current);
      if (!nested) {
        return [];
      }

      return getContentSiblings(nested).map((child) => $requireContentItemNoteId(child));
    },
    delete: (noteIds) => {
      const notes = sortHeadsByDocumentOrder($requireNotesByIds(noteIds));
      for (const note of notes.toReversed()) {
        removeNoteSubtree(note);
      }
      return notes.length > 0;
    },
    move: (noteIds, target) => $moveNotes(noteIds, target),
    indent: (noteIds) => {
      const notes = $requireNotesByIds(noteIds);
      return indentNotes(notes, $resolveBoundaryRoot());
    },
    outdent: (noteIds) => {
      const notes = $requireNotesByIds(noteIds);
      return outdentNotes(notes, $resolveBoundaryRoot());
    },
    moveUp: (noteIds) => {
      const notes = $requireNotesByIds(noteIds);
      return moveNotesUp(notes, $resolveBoundaryRoot());
    },
    moveDown: (noteIds) => {
      const notes = $requireNotesByIds(noteIds);
      return moveNotesDown(notes, $resolveBoundaryRoot());
    },
  };
}

export function createLexicalNoteSdk(options: LexicalNoteSdkAdapterOptions): NoteSdk {
  return createNoteSdk(createLexicalNoteSdkAdapter(options));
}
