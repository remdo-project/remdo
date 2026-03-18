import type { EditorNote } from '@/editor/notes/contracts';
import type {
  AdapterNoteSelection,
  EditorNotes,
  EditorNotesAdapter,
  NoteRange,
  NoteSelection,
  PlaceTarget,
} from '@/editor/notes/sdk-contracts';
import type {
  NoteId,
} from './contracts';
import { createCurrentDocumentHandle, createUserConfigHandle } from '@/documents/handles';
import { NoteNotFoundError } from './errors';
import { createNoteAs } from './handle-utils';

export function createEditorNotes(adapter: EditorNotesAdapter): EditorNotes {
  const assertBoundedNoteExists = (noteId: NoteId): void => {
    if (!adapter.isBounded(noteId)) {
      throw new NoteNotFoundError(noteId);
    }
  };

  const assertRangeNotesBounded = (range: NoteRange): void => {
    assertBoundedNoteExists(range.start);
    assertBoundedNoteExists(range.end);
  };

  const assertPlaceTargetNotesExist = (target: PlaceTarget): void => {
    if ('parent' in target) {
      if (!adapter.isBounded(target.parent)) {
        throw new NoteNotFoundError(target.parent);
      }
      return;
    }
    if ('before' in target) {
      if (!adapter.isBounded(target.before)) {
        throw new NoteNotFoundError(target.before);
      }
      return;
    }
    if (!adapter.isBounded(target.after)) {
      throw new NoteNotFoundError(target.after);
    }
  };

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
    assertRangeNotesBounded(range);
    return operation(range);
  };

  return {
    docId: () => adapter.docId(),
    currentDocument: () => createCurrentDocumentHandle(adapter, createHandle),
    userConfig: () => createUserConfigHandle(adapter, adapter.userConfigId()),
    selection: () => resolveSelection(adapter.selection()),
    createNote: (target, text) => {
      assertPlaceTargetNotesExist(target);
      return createHandle(adapter.createNote(target, text));
    },
    note: (noteId) => createHandle(noteId),
    delete: (range) => runRangeMutation(range, adapter.delete),
    place: (range, target) => {
      assertPlaceTargetNotesExist(target);
      runRangeMutation(range, (noteRange) => adapter.place(noteRange, target));
    },
    indent: (range) => runRangeMutation(range, adapter.indent),
    outdent: (range) => runRangeMutation(range, adapter.outdent),
    moveUp: (range) => runRangeMutation(range, adapter.moveUp),
    moveDown: (range) => runRangeMutation(range, adapter.moveDown),
  };
}
