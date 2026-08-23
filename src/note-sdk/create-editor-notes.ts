import type { DocumentAccessNote, DocumentNote } from './documents';
import type {
  BodyNote,
  EditorNote,
  EditorNotes,
  EditorNotesAdapter,
  NoteRange,
  PlaceTarget,
  SelectionSnapshot,
} from './editor';
import type {
  ChildPosition,
  CollectionNote,
  NoteId,
} from './notes';
import { NoteNotFoundError } from './errors';
import { createNoteAs } from './handle-utils';

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

  const createBodyHandle = (ownerId: NoteId): BodyNote => {
    const kind = () => 'body' as const;
    const handle: BodyNote = {
      kind,
      // The owner returns null from bodyTextOf once the body (or the note) is
      // gone. Throw rather than report an empty body, so a stale handle to a
      // removed body is distinguishable from an existing empty one — matching the
      // base Note.text() contract that a missing note throws.
      text: () => adapter.runRead(() => {
        const text = adapter.bodyTextOf(ownerId);
        if (text === null) {
          throw new NoteNotFoundError(ownerId);
        }
        return text;
      }),
      children: () => [],
      as: createNoteAs(ownerId, kind, () => handle),
    };
    return handle;
  };

  const createHandle = (noteId: NoteId): EditorNote => {
    const kind = () => 'editor-note' as const;
    function create(arg1: string | ChildPosition, arg2?: string): EditorNote {
      return adapter.runMutation(() => {
        const { position, text } = resolveCreateArgs(arg1, arg2);
        return createHandle(
          adapter.createNote(
            resolveChildTarget(noteId, () => adapter.childrenOf(noteId), position),
            text,
          ),
        );
      });
    }
    const handle: EditorNote = {
      id: () => noteId,
      kind,
      attached: () => adapter.runRead(() => adapter.isBounded(noteId)),
      folded: () => adapter.runRead(() => adapter.foldedOf(noteId)),
      canToggleFold: () => adapter.runRead(() => adapter.canToggleFold(noteId)),
      toggleFold: () => adapter.runMutation(() => {
        if (!adapter.isBounded(noteId)) {
          throw new NoteNotFoundError(noteId);
        }
        if (!adapter.canToggleFold(noteId)) {
          return;
        }
        adapter.setFolded(noteId, !adapter.foldedOf(noteId));
      }),
      text: () => adapter.runRead(() => adapter.textOf(noteId)),
      listType: () => adapter.runRead(() => adapter.listTypeOf(noteId)),
      checked: () => adapter.runRead(() => adapter.checkedOf(noteId)),
      parent: () => adapter.runRead(() => {
        const parentId = adapter.parentIdOf(noteId);
        return parentId === null ? null : createHandle(parentId);
      }),
      children: () => adapter.runRead(
        () => adapter.childrenOf(noteId).map((childId) => createHandle(childId))
      ),
      create,
      body: () => adapter.runRead(
        () => (adapter.bodyTextOf(noteId) === null ? null : createBodyHandle(noteId))
      ),
      as: createNoteAs(noteId, kind, () => handle),
    };
    return handle;
  };

  const createCurrentDocumentHandle = (): DocumentNote => {
    const currentDocId = adapter.docId();
    const kind = () => 'document' as const;
    function create(arg1: string | ChildPosition, arg2?: string): EditorNote {
      return adapter.runMutation(() => {
        const { position, text } = resolveCreateArgs(arg1, arg2);
        return createHandle(
          adapter.createNote(
            resolveChildTarget(currentDocId, adapter.currentDocumentChildrenIds, position),
            text,
          ),
        );
      });
    }
    const handle: DocumentNote = {
      id: () => currentDocId,
      kind,
      text: () => currentDocId,
      access: () => createEmptyDocumentAccessCollection(currentDocId),
      children: () => adapter.runRead(
        () => adapter.currentDocumentChildrenIds().map((noteId) => createHandle(noteId))
      ),
      create,
      shareable: () => false,
      shareWith: async () => {
        throw new Error('Document sharing is not available for the current editor document.');
      },
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
    docId: () => adapter.runRead(() => adapter.docId()),
    currentDocument: () => adapter.runRead(createCurrentDocumentHandle),
    focusNote: () => adapter.runRead(() => {
      const focusNoteId = adapter.focusNoteId();
      return focusNoteId === null ? null : createHandle(focusNoteId);
    }),
    selection: () => adapter.runRead(() => resolveSelection(adapter.selection())),
    note: (noteId) => createHandle(noteId),
    delete: (range) => adapter.runMutation(() => runRangeMutation(range, adapter.delete)),
    place: (range, target) => adapter.runMutation(() => {
      ensurePlaceTargetExists(target);
      runRangeMutation(range, (noteRange) => adapter.place(noteRange, target));
    }),
    indent: (range) => adapter.runMutation(() => runRangeMutation(range, adapter.indent)),
    outdent: (range) => adapter.runMutation(() => runRangeMutation(range, adapter.outdent)),
    moveUp: (range) => adapter.runMutation(() => runRangeMutation(range, adapter.moveUp)),
    moveDown: (range) => adapter.runMutation(() => runRangeMutation(range, adapter.moveDown)),
    subscribe: adapter.subscribe,
  };
}

function createEmptyDocumentAccessCollection(documentId: NoteId): CollectionNote<DocumentAccessNote> {
  const noteId = `${documentId}/access`;
  const kind = () => 'collection' as const;
  const handle: CollectionNote<DocumentAccessNote> = {
    id: () => noteId,
    kind,
    text: () => 'Access',
    children: () => [],
    byId: () => null,
    as: createNoteAs(noteId, kind, () => handle),
  };
  return handle;
}
