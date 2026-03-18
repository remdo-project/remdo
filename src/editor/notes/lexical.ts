import type { LexicalEditor, LexicalNode } from 'lexical';
import { $createTextNode, $getNodeByKey, $getSelection, $isRangeSelection, $setState } from 'lexical';
import { createUniqueNoteId } from '#lib/editor/note-ids';
import { $getNoteId, noteIdState } from '#lib/editor/note-id-state';
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
import { $requireContentItemNoteId, $requireRootContentList, resolveContentItemFromNode } from '@/editor/outline/schema';
import { $resolveZoomBoundaryRoot } from '@/editor/outline/selection/boundary';
import type { OutlineSelectionRange } from '@/editor/outline/selection/model';
import { $resolveStructuralHeadsFromRange } from '@/editor/outline/selection/range';
import {
  resolveContiguousRunIndexes,
  resolveContiguousSiblingRangeBetween,
} from '@/editor/outline/selection/sibling-run';
import {
  $resolveStructuralRangeFromLexicalSelection,
  $resolveStructuralRangeFromOutlineSelection,
} from '@/editor/outline/selection/structural-range';
import {
  getNestedList,
  isContentDescendantOf,
  removeNoteHeads,
} from '@/editor/outline/selection/tree';
import { createHardcodedDocumentMetadata } from '@/documents/hardcoded';
import type {
  AdapterNoteSelection,
  EditorNotes,
  EditorNotesAdapter,
  PlaceTarget,
  NoteRange,
} from '@/editor/notes/sdk-contracts';
import { createEditorNotes } from './createEditorNotes';
import type { NoteId } from '@/notes/contracts';
import { NoteNotFoundError } from '@/notes/errors';
import type { ListItemNode, ListNode } from '@lexical/list';
import { $createListItemNode, $isListItemNode, $isListNode } from '@lexical/list';

interface LexicalNoteSdkAdapterOptions {
  editor: LexicalEditor;
  docId: string;
}

function createLexicalNoteSdkAdapter({ editor, docId }: LexicalNoteSdkAdapterOptions): EditorNotesAdapter {
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
    return resolveContiguousSiblingRangeBetween(start, end);
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
        const run = resolveContiguousRunIndexes(movedNotes, siblings);
        const siblingIndex = siblings.indexOf(sibling);
        if (run && siblingIndex === run.endIndex + 1) {
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
        const run = resolveContiguousRunIndexes(movedNotes, siblings);
        const siblingIndex = siblings.indexOf(sibling);
        if (run && siblingIndex === run.startIndex - 1) {
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

  const $noteRangeFromStructuralRange = (range: OutlineSelectionRange): NoteRange | null => {
    const heads = $resolveStructuralHeadsFromRange(range).map((head) => $requireContentItemNoteId(head));
    return noteRangeFromOrderedIds(heads);
  };

  const $selectionFallbackFromRange = (): AdapterNoteSelection => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      return { kind: 'none', range: null };
    }

    const structuralRange = $resolveStructuralRangeFromLexicalSelection(selection, { allowMultiNoteSelection: true });
    if (structuralRange) {
      const noteRange = $noteRangeFromStructuralRange(structuralRange);
      if (noteRange) {
        return { kind: 'structural', range: noteRange };
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

    const outlineRange = $resolveStructuralRangeFromOutlineSelection(outlineSelection);
    if (outlineRange) {
      const structuralNoteRange = $noteRangeFromStructuralRange(outlineRange);
      return structuralNoteRange ? { kind: 'structural', range: structuralNoteRange } : { kind: 'none', range: null };
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
    currentDocumentChildrenIds: () => {
      const rootList = $requireRootContentList();
      return getContentSiblings(rootList)
        .map((item) => $getNoteId(item))
        .filter((noteId): noteId is NoteId => noteId !== null);
    },
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

      return getContentSiblings(nested)
        .map((child) => $getNoteId(child))
        .filter((noteId): noteId is NoteId => noteId !== null);
    },
    delete: (range) => {
      const resolved = $resolveRangeNotes(range);
      if (!resolved || resolved.length === 0) {
        return false;
      }
      return removeNoteHeads(resolved);
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

export function createLexicalNoteSdk(options: LexicalNoteSdkAdapterOptions): EditorNotes {
  const metadata = createHardcodedDocumentMetadata();
  return createEditorNotes(createLexicalNoteSdkAdapter(options), metadata);
}
