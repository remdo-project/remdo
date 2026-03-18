import type {
  AdapterNoteSelection,
  DocumentListNote,
  DocumentNote,
  EditorNote,
  PlaceTarget,
  Note,
  NoteId,
  NoteKind,
  NoteRange,
  NoteSdk,
  NoteSdkAdapter,
  NoteSelection,
  UserConfigNote,
} from './contracts';
import { NoteNotFoundError } from './errors';

function createNoteAs(noteId: NoteId, kind: () => NoteKind, self: () => Note): Note['as'] {
  function asNote(kindToMatch: 'editor-note'): EditorNote;
  function asNote(kindToMatch: 'user-config'): UserConfigNote;
  function asNote(kindToMatch: 'document-list'): DocumentListNote;
  function asNote(kindToMatch: 'document'): DocumentNote;
  function asNote(kindToMatch: NoteKind): Note;
  function asNote(kindToMatch: NoteKind): Note {
    const actualKind = kind();
    if (actualKind !== kindToMatch) {
      throw new Error(`Note "${noteId}" is "${actualKind}", expected "${kindToMatch}".`);
    }
    return self();
  }
  return asNote;
}

export function createNoteSdk(adapter: NoteSdkAdapter): NoteSdk {
  const assertNoteExists = (noteId: NoteId): void => {
    if (!adapter.hasNote(noteId)) {
      throw new NoteNotFoundError(noteId);
    }
  };

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
      text: () => {
        assertNoteExists(noteId);
        return adapter.textOf(noteId);
      },
      children: () => {
        assertNoteExists(noteId);
        return adapter.childrenOf(noteId).map((childId) => createHandle(childId));
      },
      as: createNoteAs(noteId, kind, () => handle),
    };
    return handle;
  };

  // TODO(note-sdk): This is a temporary user-config-specific read path.
  // Refactor to repository-scoped note resolvers once SDK composes user-config
  // and document note repositories at the facade level.
  const createUserConfigHandle = (noteId: NoteId): Note => {
    const kind = () => {
      if (!adapter.hasUserConfigNote(noteId)) {
        throw new NoteNotFoundError(noteId);
      }
      return adapter.userConfigKindOf(noteId);
    };
    const handle: Note = {
      id: () => noteId,
      kind,
      text: () => {
        if (!adapter.hasUserConfigNote(noteId)) {
          throw new NoteNotFoundError(noteId);
        }
        return adapter.userConfigTextOf(noteId);
      },
      children: () => {
        if (!adapter.hasUserConfigNote(noteId)) {
          throw new NoteNotFoundError(noteId);
        }
        return adapter.userConfigChildrenOf(noteId).map((childId) => createUserConfigHandle(childId));
      },
      as: createNoteAs(noteId, kind, () => handle),
    };
    return handle;
  };

  const createNoneSelection = (): NoteSelection => ({ kind: 'none', range: null });

  const createCurrentDocumentHandle = (): DocumentNote => {
    const currentDocId = adapter.docId();
    const kind = () => 'document' as const;
    const handle: DocumentNote = {
      id: () => currentDocId,
      kind,
      text: () => {
        if (adapter.hasUserConfigNote(currentDocId) && adapter.userConfigKindOf(currentDocId) === 'document') {
          return adapter.userConfigTextOf(currentDocId);
        }
        return currentDocId;
      },
      children: () => adapter.currentDocumentChildrenIds().map((noteId) => createHandle(noteId)),
      as: createNoteAs(currentDocId, kind, () => handle),
    };
    return handle;
  };

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
    currentDocument: () => createCurrentDocumentHandle(),
    userConfig: () => createUserConfigHandle(adapter.userConfigId()),
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
