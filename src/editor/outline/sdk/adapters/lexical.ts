import type { LexicalEditor } from 'lexical';
import { $getNodeByKey, $getSelection, $isRangeSelection } from 'lexical';
import { getContentSiblings, isChildrenWrapper } from '@/editor/outline/list-structure';
import { indentNotes, moveNotesDown, moveNotesUp, outdentNotes } from '@/editor/outline/note-ops';
import { $findNoteById } from '@/editor/outline/note-traversal';
import { $requireContentItemNoteId, resolveContentItemFromNode } from '@/editor/outline/schema';
import { $resolveZoomBoundaryRoot } from '@/editor/outline/selection/boundary';
import { getContiguousSelectionHeads, getSelectedNotes } from '@/editor/outline/selection/heads';
import { getNestedList, removeNoteSubtree, sortHeadsByDocumentOrder } from '@/editor/outline/selection/tree';
import { createNoteSdk } from '../core';
import type { AdapterNoteSelection, NoteId, NoteSdk, NoteSdkAdapter } from '../contracts';
import { NoteNotFoundError } from '../errors';
import type { ListItemNode } from '@lexical/list';
import { $isListItemNode } from '@lexical/list';

export interface LexicalNoteSdkAdapterOptions {
  editor: LexicalEditor;
  docId: string;
}

export function createLexicalNoteSdkAdapter({ editor, docId }: LexicalNoteSdkAdapterOptions): NoteSdkAdapter {
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
    adapterSelection: () => $adapterSelection(),
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
