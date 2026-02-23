import type { LexicalEditor } from 'lexical';
import { $getNodeByKey, $getSelection, $isRangeSelection } from 'lexical';
import { getContentSiblings, isChildrenWrapper } from '@/editor/outline/list-structure';
import { indentNotes, moveNotesDown, moveNotesUp, outdentNotes } from '@/editor/outline/note-ops';
import { $findNoteById } from '@/editor/outline/note-traversal';
import { $requireContentItemNoteId, resolveContentItemFromNode } from '@/editor/outline/schema';
import { $resolveZoomBoundaryRoot } from '@/editor/outline/selection/boundary';
import { getContiguousSelectionHeads, getSelectedNotes } from '@/editor/outline/selection/heads';
import { getNestedList } from '@/editor/outline/selection/tree';
import { createNoteSdk } from '../core';
import type { AdapterNoteSelection, NoteId, NoteSdk, NoteSdkAdapter } from '../contracts';
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
      throw new Error(`Note not found: ${noteId}`);
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
      return { kind: 'none', headIds: [] };
    }

    if (!selection.isCollapsed()) {
      const headIds = getContiguousSelectionHeads(selection).map((head) => $requireContentItemNoteId(head));
      const hasMultiNoteSelection = getSelectedNotes(selection).length > 1;
      if ((headIds.length > 1 || hasMultiNoteSelection) && headIds.length > 0) {
        return { kind: 'structural', headIds };
      }
    }

    const item = resolveContentItemFromNode(selection.focus.getNode()) ??
      resolveContentItemFromNode(selection.anchor.getNode());
    if (!item) {
      return { kind: 'none', headIds: [] };
    }

    const noteId = $requireContentItemNoteId(item);
    return selection.isCollapsed() ? { kind: 'caret', headIds: [noteId] } : { kind: 'inline', headIds: [noteId] };
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
      const headIds = keys
        .map((key) => $noteIdFromContentKey(key))
        .filter((noteId): noteId is NoteId => noteId !== null);
      return headIds.length > 0 ? { kind: 'structural', headIds } : { kind: 'none', headIds: [] };
    }

    const key = outlineSelection.focusKey ?? outlineSelection.anchorKey;
    if (!key) {
      return $selectionFallbackFromRange();
    }
    const noteId = $noteIdFromContentKey(key);
    if (!noteId) {
      return { kind: 'none', headIds: [] };
    }
    return outlineSelection.kind === 'inline' ? { kind: 'inline', headIds: [noteId] } : { kind: 'caret', headIds: [noteId] };
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
    indentNotes: (noteIds) => {
      const notes = $requireNotesByIds(noteIds);
      return indentNotes(notes, $resolveBoundaryRoot());
    },
    outdentNotes: (noteIds) => {
      const notes = $requireNotesByIds(noteIds);
      return outdentNotes(notes, $resolveBoundaryRoot());
    },
    moveNotesUp: (noteIds) => {
      const notes = $requireNotesByIds(noteIds);
      return moveNotesUp(notes, $resolveBoundaryRoot());
    },
    moveNotesDown: (noteIds) => {
      const notes = $requireNotesByIds(noteIds);
      return moveNotesDown(notes, $resolveBoundaryRoot());
    },
  };
}

export function createLexicalNoteSdk(options: LexicalNoteSdkAdapterOptions): NoteSdk {
  return createNoteSdk(createLexicalNoteSdkAdapter(options));
}
