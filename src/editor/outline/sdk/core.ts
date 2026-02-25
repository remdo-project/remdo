import type {
  AdapterNoteSelection,
  MoveTarget,
  Note,
  NoteId,
  NoteRange,
  NoteSdk,
  NoteSdkAdapter,
  NoteSelection,
} from './contracts';
import { NoteNotFoundError } from './errors';

export function createNoteSdk(adapter: NoteSdkAdapter): NoteSdk {
  const assertNoteExists = (noteId: NoteId): void => {
    if (!adapter.hasNote(noteId)) {
      throw new NoteNotFoundError(noteId);
    }
  };

  const assertRangeNotesExist = (range: NoteRange): void => {
    assertNoteExists(range.start);
    assertNoteExists(range.end);
  };

  const assertMoveTargetNotesExist = (target: MoveTarget): void => {
    if ('parent' in target) {
      assertNoteExists(target.parent);
      return;
    }
    if ('before' in target) {
      assertNoteExists(target.before);
      return;
    }
    assertNoteExists(target.after);
  };

  const createHandle = (noteId: NoteId): Note => ({
    id: () => noteId,
    text: () => {
      assertNoteExists(noteId);
      return adapter.textOf(noteId);
    },
    children: () => {
      assertNoteExists(noteId);
      return adapter.childrenOf(noteId).map((childId) => createHandle(childId));
    },
  });

  const getNoteOrThrow = (noteId: NoteId): Note => {
    assertNoteExists(noteId);
    return createHandle(noteId);
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

  const runRangeMutation = (
    range: NoteRange,
    operation: (noteRange: NoteRange) => boolean
  ): boolean => {
    assertRangeNotesExist(range);
    return operation(range);
  };

  return {
    docId: () => adapter.docId(),
    selection: () => resolveSelection(adapter.selection()),
    note: (noteId) => getNoteOrThrow(noteId),
    delete: (range) => runRangeMutation(range, adapter.delete),
    move: (range, target) => {
      assertMoveTargetNotesExist(target);
      return runRangeMutation(range, (noteRange) => adapter.move(noteRange, target));
    },
    indent: (range) => runRangeMutation(range, adapter.indent),
    outdent: (range) => runRangeMutation(range, adapter.outdent),
    moveUp: (range) => runRangeMutation(range, adapter.moveUp),
    moveDown: (range) => runRangeMutation(range, adapter.moveDown),
  };
}
