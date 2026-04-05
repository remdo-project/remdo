import type { DocumentNote } from '@/documents/contracts';
import type {
  EditorNote,
  EditorNotes,
  EditorNotesAdapter,
  NoteRange,
  PlaceTarget,
  SelectionSnapshot,
} from '@/editor/notes/contracts';
import type {
  ChildPosition,
  NoteId,
} from '@/notes/contracts';
import { NoteNotFoundError } from '@/notes/errors';
import { createNoteAs } from '@/notes/handle-utils';

export function createEditorNotes(adapter: EditorNotesAdapter): EditorNotes {
  const resolveCreateArgs = (
    arg1: string | ChildPosition,
    arg2?: string,
  ): { position?: ChildPosition; text: string } => {
    if (typeof arg1 === 'string') {
      return { text: arg1 };
    }
    if (typeof arg2 !== 'string') {
      throw new TypeError('create(position, text) requires explicit note text.');
    }
    return { position: arg1, text: arg2 };
  };

  const resolveChildTarget = (
    parentId: NoteId,
    childIds: () => readonly NoteId[],
    position?: ChildPosition,
  ): PlaceTarget => {
    if (!position) {
      return { parent: parentId, index: -1 };
    }
    if ('index' in position) {
      return { parent: parentId, index: position.index };
    }
    const anchorId = 'before' in position ? position.before : position.after;
    if (!childIds().includes(anchorId)) {
      throw new Error(`Note "${anchorId}" is not a child of "${parentId}".`);
    }
    return position;
  };

  const createHandle = (noteId: NoteId): EditorNote => {
    const kind = () => 'editor-note' as const;
    function create(arg1: string | ChildPosition, arg2?: string): EditorNote {
      const { position, text } = resolveCreateArgs(arg1, arg2);
      return createHandle(adapter.createNote(resolveChildTarget(noteId, () => adapter.childrenOf(noteId), position), text));
    }
    const handle: EditorNote = {
      id: () => noteId,
      kind,
      attached: () => adapter.isBounded(noteId),
      text: () => adapter.textOf(noteId),
      children: () => adapter.childrenOf(noteId).map((childId) => createHandle(childId)),
      create,
      as: createNoteAs(noteId, kind, () => handle),
    };
    return handle;
  };

  const createCurrentDocumentHandle = (): DocumentNote => {
    const currentDocId = adapter.docId();
    const kind = () => 'document' as const;
    function create(arg1: string | ChildPosition, arg2?: string): EditorNote {
      const { position, text } = resolveCreateArgs(arg1, arg2);
      return createHandle(
        adapter.createNote(resolveChildTarget(currentDocId, adapter.currentDocumentChildrenIds, position), text),
      );
    }
    const handle: DocumentNote = {
      id: () => currentDocId,
      kind,
      text: () => currentDocId,
      children: () => adapter.currentDocumentChildrenIds().map((noteId) => createHandle(noteId)),
      create,
      as: createNoteAs(currentDocId, kind, () => handle),
    };
    return handle;
  };

  const createNoneSelection = (): SelectionSnapshot => ({ kind: 'none', range: null });

  const resolveSelection = (adapterSelection: SelectionSnapshot): SelectionSnapshot => {
    if (adapterSelection.kind === 'none') {
      return createNoneSelection();
    }

    const { start, end } = adapterSelection.range;
    if (!adapter.hasNote(start) || !adapter.hasNote(end)) {
      return createNoneSelection();
    }
    return adapterSelection;
  };

  const runRangeMutation = <T>(
    range: NoteRange,
    operation: (noteRange: NoteRange) => T
  ): T => {
    if (!adapter.isBounded(range.start)) {
      throw new NoteNotFoundError(range.start);
    }
    if (!adapter.isBounded(range.end)) {
      throw new NoteNotFoundError(range.end);
    }
    return operation(range);
  };

  const ensurePlaceTargetExists = (target: PlaceTarget): void => {
    const noteId = 'parent' in target ? target.parent : 'before' in target ? target.before : target.after;
    if (noteId !== adapter.docId() && !adapter.isBounded(noteId)) {
      throw new NoteNotFoundError(noteId);
    }
  };

  return {
    docId: () => adapter.docId(),
    currentDocument: createCurrentDocumentHandle,
    selection: () => resolveSelection(adapter.selection()),
    note: (noteId) => createHandle(noteId),
    delete: (range) => runRangeMutation(range, adapter.delete),
    place: (range, target) => {
      ensurePlaceTargetExists(target);
      runRangeMutation(range, (noteRange) => adapter.place(noteRange, target));
    },
    indent: (range) => runRangeMutation(range, adapter.indent),
    outdent: (range) => runRangeMutation(range, adapter.outdent),
    moveUp: (range) => runRangeMutation(range, adapter.moveUp),
    moveDown: (range) => runRangeMutation(range, adapter.moveDown),
  };
}
