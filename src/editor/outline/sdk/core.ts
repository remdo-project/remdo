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

export function createNoteSdk(adapter: NoteSdkAdapter): NoteSdk {
  const sameSelectionKind = (left: NoteSelectionKind, right: NoteSelectionKind): boolean => left === right;

  const assertNoteExists = (noteId: NoteId): void => {
    if (!adapter.hasNote(noteId)) {
      throw new Error(`Note not found: ${noteId}`);
    }
  };

  const createHandle = (noteId: NoteId): Note => ({
    id: () => noteId,
    text: () => {
      assertNoteExists(noteId);
      return adapter.textOf(noteId) ?? '';
    },
    children: () => {
      assertNoteExists(noteId);
      const childIds = adapter.childrenOf(noteId);
      if (!childIds) {
        return [];
      }
      return childIds.map((childId) => createHandle(childId));
    },
    indent: () => {
      assertNoteExists(noteId);
      return adapter.indent(noteId);
    },
    outdent: () => {
      assertNoteExists(noteId);
      return adapter.outdent(noteId);
    },
    moveUp: () => {
      assertNoteExists(noteId);
      return adapter.moveUp(noteId);
    },
    moveDown: () => {
      assertNoteExists(noteId);
      return adapter.moveDown(noteId);
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

  const createSelection = <K extends NoteSelectionKind>(
    shape: Extract<NoteSelectionVariant, { kind: K }>
  ): NoteSelectionByKind<K> => {
    const selection: NoteSelectionByKind<K> = {
      ...shape,
      as: <ExpectedKind extends NoteSelectionKind>(kind: ExpectedKind): NoteSelectionByKind<ExpectedKind> => {
        if (!sameSelectionKind(selection.kind, kind)) {
          throw new Error(`Expected ${kind} selection, got ${selection.kind}`);
        }
        return selection as unknown as NoteSelectionByKind<ExpectedKind>;
      },
    };
    return selection;
  };

  const resolveSelection = (adapterSelection: AdapterNoteSelection): NoteSelection => {
    if (adapterSelection.kind === 'none') {
      return createSelection({ kind: 'none' });
    }

    if (adapterSelection.kind === 'caret' || adapterSelection.kind === 'inline') {
      const note = resolveHandle(adapterSelection.noteId);
      if (!note) {
        return createSelection({ kind: 'none' });
      }
      return createSelection({ kind: adapterSelection.kind, note });
    }

    const heads = adapterSelection.headIds
      .map((noteId) => resolveHandle(noteId))
      .filter((note): note is Note => note !== null);
    if (heads.length === 0) {
      return createSelection({ kind: 'none' });
    }

    return createSelection({ kind: 'structural', heads });
  };

  return {
    docId: () => adapter.docId(),
    selection: () => resolveSelection(adapter.adapterSelection()),
    get: (noteId) => getOrThrow(noteId),
  };
}
