import type {
  AdapterNoteSelection,
  Note,
  NoteId,
  NoteSdk,
  NoteSdkAdapter,
  NoteSelection,
  NoteSelectionByKind,
  NoteSelectionKind,
  NoteSelectionVariant,
} from './contracts';
import { NoteNotFoundError } from './errors';

export function createNoteSdk(adapter: NoteSdkAdapter): NoteSdk {
  const sameSelectionKind = (left: NoteSelectionKind, right: NoteSelectionKind): boolean => left === right;

  const assertNoteExists = (noteId: NoteId): void => {
    if (!adapter.hasNote(noteId)) {
      throw new NoteNotFoundError(noteId);
    }
  };

  const createHandle = (noteId: NoteId): Note => ({
    id: () => noteId,
    text: () => {
      return adapter.textOf(noteId);
    },
    children: () => {
      return adapter.childrenOf(noteId).map((childId) => createHandle(childId));
    },
  });

  const resolveHandle = (noteId: NoteId): Note | null => {
    if (!adapter.hasNote(noteId)) {
      return null;
    }
    return createHandle(noteId);
  };

  const getOrThrow = (noteId: NoteId): Note => {
    assertNoteExists(noteId);
    return createHandle(noteId);
  };

  const runNoteMutation = (
    notes: readonly Note[],
    operation: (noteIds: readonly NoteId[]) => boolean
  ): boolean => {
    if (notes.length === 0) {
      return false;
    }

    const noteIds = notes.map((note) => note.id());
    return operation(noteIds);
  };

  const createSelection = <K extends NoteSelectionKind>(
    shape: Extract<NoteSelectionVariant, { kind: K }>,
    heads: readonly Note[]
  ): NoteSelectionByKind<K> => {
    const selection: NoteSelectionByKind<K> = {
      ...shape,
      as: <ExpectedKind extends NoteSelectionKind>(kind: ExpectedKind): NoteSelectionByKind<ExpectedKind> => {
        if (!sameSelectionKind(selection.kind, kind)) {
          throw new Error(`Expected ${kind} selection, got ${selection.kind}`);
        }
        return selection as unknown as NoteSelectionByKind<ExpectedKind>;
      },
      heads: () => heads,
    };
    return selection;
  };

  const resolveSelection = (adapterSelection: AdapterNoteSelection): NoteSelection => {
    if (adapterSelection.kind === 'none') {
      return createSelection({ kind: 'none' }, []);
    }

    const heads = adapterSelection.headIds
      .map((noteId) => resolveHandle(noteId))
      .filter((note): note is Note => note !== null);
    if (heads.length === 0) {
      return createSelection({ kind: 'none' }, []);
    }

    return createSelection({ kind: adapterSelection.kind }, heads);
  };

  return {
    docId: () => adapter.docId(),
    selection: () => resolveSelection(adapter.adapterSelection()),
    get: (noteId) => getOrThrow(noteId),
    delete: (notes) => runNoteMutation(notes, adapter.deleteNotes),
    indent: (notes) => runNoteMutation(notes, adapter.indentNotes),
    outdent: (notes) => runNoteMutation(notes, adapter.outdentNotes),
    moveUp: (notes) => runNoteMutation(notes, adapter.moveNotesUp),
    moveDown: (notes) => runNoteMutation(notes, adapter.moveNotesDown),
  };
}
