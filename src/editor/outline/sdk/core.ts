import type {
  AdapterNoteSelection,
  Note,
  NoteId,
  NoteSdk,
  NoteSdkAdapter,
  NoteSelection,
  NoteSelectionKind,
} from './contracts';
import { NoteNotFoundError } from './errors';

export function createNoteSdk(adapter: NoteSdkAdapter): NoteSdk {
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

  const createSelection = (kind: NoteSelectionKind, heads: readonly Note[]): NoteSelection => {
    return {
      kind,
      heads,
    };
  };

  const resolveSelection = (adapterSelection: AdapterNoteSelection): NoteSelection => {
    if (adapterSelection.kind === 'none') {
      return createSelection('none', []);
    }

    const heads = adapterSelection.heads
      .map((noteId) => resolveHandle(noteId))
      .filter((note): note is Note => note !== null);
    if (heads.length === 0) {
      return createSelection('none', []);
    }

    return createSelection(adapterSelection.kind, heads);
  };

  return {
    docId: () => adapter.docId(),
    selection: () => resolveSelection(adapter.selection()),
    get: (noteId) => getOrThrow(noteId),
    delete: (notes) => runNoteMutation(notes, adapter.delete),
    indent: (notes) => runNoteMutation(notes, adapter.indent),
    outdent: (notes) => runNoteMutation(notes, adapter.outdent),
    moveUp: (notes) => runNoteMutation(notes, adapter.moveUp),
    moveDown: (notes) => runNoteMutation(notes, adapter.moveDown),
  };
}
