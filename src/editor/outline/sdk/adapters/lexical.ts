import type { LexicalEditor, LexicalNode } from 'lexical';
import { $createTextNode, $getNodeByKey, $getSelection, $isRangeSelection, $setState } from 'lexical';
import { createUniqueNoteId } from '#lib/editor/note-ids';
import { noteIdState } from '#lib/editor/note-id-state';
import { noteRangeFromNoteId, noteRangeFromOrderedIds } from '@/editor/outline/note-range';
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
import { $resolveZoomBoundaryRoot } from '@/editor/outline/selection/boundary';
import { getContiguousSelectionHeads, getSelectedNotes } from '@/editor/outline/selection/heads';
import {
  getNestedList,
  isContentDescendantOf,
  removeNoteSubtree,
  sortHeadsByDocumentOrder,
} from '@/editor/outline/selection/tree';
import { createNoteSdk } from '../core';
import type {
  AdapterNoteSelection,
  PlaceTarget,
  NoteId,
  NoteRange,
  NoteSdk,
  NoteSdkAdapter,
} from '../contracts';
import { NoteNotFoundError } from '../errors';
import type { ListItemNode, ListNode } from '@lexical/list';
import { $createListItemNode, $isListItemNode, $isListNode } from '@lexical/list';

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
  const $resolveRangeNotes = (range: NoteRange): ListItemNode[] | null => {
    const start = $requireNoteById(range.start);
    const end = $requireNoteById(range.end);

    const parent = start.getParent();
    if (!$isListNode(parent) || end.getParent() !== parent) {
      return null;
    }

    const siblings = getContentSiblings(parent);
    const startIndex = siblings.indexOf(start);
    const endIndex = siblings.indexOf(end);
    if (startIndex === -1 || endIndex === -1 || startIndex > endIndex) {
      return null;
    }

    return siblings.slice(startIndex, endIndex + 1);
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
        throw new Error('place() expects unique note heads');
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
          throw new Error('place() expects head notes only (no ancestor/descendant overlap)');
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
  const $resolvePlaceInsertionTarget = (
    target: PlaceTarget,
    movedNotes: ListItemNode[]
  ): MoveInsertionTarget => {
    const movedKeys = new Set(movedNotes.map((note) => note.getKey()));
    const isInsideMovedSubtree = (candidate: ListItemNode): boolean =>
      movedNotes.some((note) => isContentDescendantOf(candidate, note));

    if ('before' in target) {
      const sibling = $requireNoteById(target.before);
      if (movedKeys.has(sibling.getKey())) {
        throw new Error('Cannot place notes before themselves');
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
          throw new Error('place() target would be a no-op');
        }
      }
      return { kind: 'before', reference: sibling };
    }

    if ('after' in target) {
      const sibling = $requireNoteById(target.after);
      if (movedKeys.has(sibling.getKey())) {
        throw new Error('Cannot place notes after themselves');
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
          throw new Error('place() target would be a no-op');
        }
      }

      const siblingNodes = getNodesForNote(sibling);
      const siblingTail = siblingNodes.at(-1);
      if (!siblingTail) {
        throw new Error('Could not resolve place() target');
      }
      return { kind: 'after', reference: siblingTail };
    }

    const parent = $requireNoteById(target.parent);
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
  const $placeNotes = (notes: ListItemNode[], target: PlaceTarget): void => {
    if (notes.length === 0) {
      throw new Error('place() expects at least one note');
    }
    const hasDetached = notes.some((note) => !note.isAttached());
    const hasAttached = notes.some((note) => note.isAttached());
    if (hasDetached && hasAttached) {
      throw new Error('place() cannot mix attached and detached notes');
    }

    $assertMoveHeads(notes);

    const insertion = $resolvePlaceInsertionTarget(target, notes);

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
  };
  const $createNote = (target: PlaceTarget, text: string): NoteId => {
    const note = $createListItemNode();
    note.append($createTextNode(text));
    const noteId = createUniqueNoteId();

    $placeNotes([note], target);

    $setState(note, noteIdState, noteId);
    return noteId;
  };

  const $selectionFallbackFromRange = (): AdapterNoteSelection => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      return { kind: 'none', range: null };
    }

    if (!selection.isCollapsed()) {
      const heads = getContiguousSelectionHeads(selection).map((head) => $requireContentItemNoteId(head));
      const hasMultiNoteSelection = getSelectedNotes(selection).length > 1;
      const range = noteRangeFromOrderedIds(heads);
      if ((heads.length > 1 || hasMultiNoteSelection) && range) {
        return { kind: 'structural', range };
      }
    }

    const item = resolveContentItemFromNode(selection.focus.getNode()) ??
      resolveContentItemFromNode(selection.anchor.getNode());
    if (!item) {
      return { kind: 'none', range: null };
    }

    const noteId = $requireContentItemNoteId(item);
    const range = noteRangeFromNoteId(noteId);
    return selection.isCollapsed() ? { kind: 'caret', range } : { kind: 'inline', range };
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
      const range = noteRangeFromOrderedIds(heads);
      return range ? { kind: 'structural', range } : { kind: 'none', range: null };
    }

    const key = outlineSelection.focusKey ?? outlineSelection.anchorKey;
    if (!key) {
      return $selectionFallbackFromRange();
    }
    const noteId = $noteIdFromContentKey(key);
    if (!noteId) {
      return { kind: 'none', range: null };
    }
    const range = noteRangeFromNoteId(noteId);
    return outlineSelection.kind === 'inline' ? { kind: 'inline', range } : { kind: 'caret', range };
  };

  return {
    docId: () => docId,
    selection: () => $adapterSelection(),
    createNote: (target, text = '') => $createNote(target, text),
    hasNote: (noteId) => Boolean($resolveNoteById(noteId)),
    isBounded: (noteId) => Boolean($resolveNoteById(noteId)),
    textOf: (noteId) => $requireNoteById(noteId).getTextContent(),
    childrenOf: (noteId) => {
      const current = $requireNoteById(noteId);

      const nested = getNestedList(current);
      if (!nested) {
        return [];
      }

      return getContentSiblings(nested).map((child) => $requireContentItemNoteId(child));
    },
    delete: (range) => {
      const resolved = $resolveRangeNotes(range);
      if (!resolved || resolved.length === 0) {
        return false;
      }

      const notes = sortHeadsByDocumentOrder(resolved);
      for (const note of notes.toReversed()) {
        removeNoteSubtree(note);
      }
      return notes.length > 0;
    },
    place: (range, target) => {
      const resolved = $resolveRangeNotes(range);
      if (!resolved || resolved.length === 0) {
        throw new Error('place() expects a contiguous sibling range');
      }
      $placeNotes(resolved, target);
    },
    indent: (range) => {
      const resolved = $resolveRangeNotes(range);
      if (!resolved || resolved.length === 0) {
        return false;
      }
      return indentNotes(resolved, $resolveBoundaryRoot());
    },
    outdent: (range) => {
      const resolved = $resolveRangeNotes(range);
      if (!resolved || resolved.length === 0) {
        return false;
      }
      return outdentNotes(resolved, $resolveBoundaryRoot());
    },
    moveUp: (range) => {
      const resolved = $resolveRangeNotes(range);
      if (!resolved || resolved.length === 0) {
        return false;
      }
      return moveNotesUp(resolved, $resolveBoundaryRoot());
    },
    moveDown: (range) => {
      const resolved = $resolveRangeNotes(range);
      if (!resolved || resolved.length === 0) {
        return false;
      }
      return moveNotesDown(resolved, $resolveBoundaryRoot());
    },
  };
}

export function createLexicalNoteSdk(options: LexicalNoteSdkAdapterOptions): NoteSdk {
  return createNoteSdk(createLexicalNoteSdkAdapter(options));
}
