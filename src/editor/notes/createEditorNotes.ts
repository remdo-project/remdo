import type {
  AdapterNoteSelection,
  EditorNote,
  EditorNotes,
  EditorNotesAdapter,
  NoteRange,
  NoteSelection,
  PlaceTarget,
} from '@/editor/notes/contracts';
import type {
  NoteId,
} from '@/notes/contracts';
import { createCurrentDocumentHandle } from '@/documents/handles';
import { NoteNotFoundError } from '@/notes/errors';
import { createNoteAs } from '@/notes/handle-utils';

export function createEditorNotes(adapter: EditorNotesAdapter): EditorNotes {
  const createHandle = (noteId: NoteId): EditorNote => {
    const kind = () => 'editor-note' as const;
    const handle: EditorNote = {
      id: () => noteId,
      kind,
      attached: () => adapter.isBounded(noteId),
      text: () => adapter.textOf(noteId),
      children: () => adapter.childrenOf(noteId).map((childId) => createHandle(childId)),
      as: createNoteAs(noteId, kind, () => handle),
    };
    return handle;
  };

  const createNoneSelection = (): NoteSelection => ({ kind: 'none', range: null });

  const resolveSelection = (adapterSelection: AdapterNoteSelection): NoteSelection => {
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
    if (!adapter.isBounded(noteId)) {
      throw new NoteNotFoundError(noteId);
    }
  };

  return {
    docId: () => adapter.docId(),
    currentDocument: () => createCurrentDocumentHandle(adapter, createHandle),
    selection: () => resolveSelection(adapter.selection()),
    createNote: (target, text) => {
      ensurePlaceTargetExists(target);
      return createHandle(adapter.createNote(target, text));
    },
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
