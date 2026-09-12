import type { ListItemNode, ListNode } from '@lexical/list';
import { $isListItemNode } from '@lexical/list';
import { mergeRegister } from '@lexical/utils';
import type { EditorState, LexicalEditor } from 'lexical';
import {
  $getNodeByKey,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_LOW,
  REDO_COMMAND,
  UNDO_COMMAND,
} from 'lexical';
import { useEffect, useMemo } from 'react';
import type {
  ChildListSnapshot,
  DocumentCapabilitiesSnapshot,
  DocumentSession,
  DocumentSnapshot,
  EditorNoteSnapshot,
  LoadState,
  NoteId,
  OpenDocumentNote,
} from '#note-sdk';
import {
  DELETE_SELECTED_NOTES_COMMAND,
  INDENT_NOTES_COMMAND,
  OUTDENT_NOTES_COMMAND,
  REORDER_NOTES_DOWN_COMMAND,
  REORDER_NOTES_UP_COMMAND,
  SET_NOTE_CHECKED_COMMAND,
  SET_NOTE_FOLD_COMMAND,
} from '#client/editor/foundation/commands';
import { $canOfferFold } from '#client/editor/features/folding/fold-offer';
import { $getNoteChecked } from '#client/editor/features/list-types/checked-state';
import { $isNoteFolded } from '#client/editor/outline/fold-state';
import { getContentSiblings, isWrapperItem } from '#client/editor/outline/list-structure';
import { $resolveFocusNoteKey } from '#client/editor/outline/note-context';
import { $canDeleteFocusedOrSelectedNotes } from '#client/editor/outline/selection/delete-selection';
import { getNoteOwnText } from '#client/editor/outline/selection/note-body';
import { getNestedList } from '#client/editor/outline/selection/tree';
import { $findNoteById } from '#client/editor/outline/note-traversal';
import { $resolveRootContentList } from '#client/editor/outline/schema';
import { $getNoteId } from '#client/editor/runtime/note-ids/note-id-state';
import { subscribeViewRoot } from '#client/editor/outline/view-root';

interface LexicalDocumentSessionSource {
  editor: LexicalEditor;
  docId: string;
}

interface UseLexicalDocumentSessionOptions extends LexicalDocumentSessionSource {
  ready?: boolean;
}

interface DocumentProjection {
  nodeKeys: Map<NoteId, string>;
  snapshot: DocumentSnapshot;
}

interface AddressedNoteValues {
  folded: boolean;
  text: string;
}

interface AddressedNoteObservation {
  listeners: Set<() => void>;
  values: AddressedNoteValues | null;
}

/** Runtime-readonly view: consumers cannot cast the public index back to Map and mutate it. */
class ImmutableMapView<K, V> implements ReadonlyMap<K, V> {
  readonly #map: Map<K, V>;
  readonly [Symbol.toStringTag] = 'ImmutableMapView';

  constructor(entries: Map<K, V>) {
    this.#map = entries;
    Object.freeze(this);
  }

  get size(): number {
    return this.#map.size;
  }

  get(key: K): V | undefined {
    return this.#map.get(key);
  }

  has(key: K): boolean {
    return this.#map.has(key);
  }

  forEach(
    callback: (value: V, key: K, map: ReadonlyMap<K, V>) => void,
    thisArg?: unknown,
  ): void {
    for (const [key, value] of this.#map) {
      callback.call(thisArg, value, key, this);
    }
  }

  entries(): MapIterator<[K, V]> {
    return this.#map.entries();
  }

  keys(): MapIterator<K> {
    return this.#map.keys();
  }

  values(): MapIterator<V> {
    return this.#map.values();
  }

  [Symbol.iterator](): MapIterator<[K, V]> {
    return this.#map[Symbol.iterator]();
  }
}

export interface LexicalDocumentSessionRuntime {
  session: DocumentSession;
  start: () => () => void;
  setSourceReady: (ready: boolean) => void;
  dispose: () => void;
}

const LOADING = Object.freeze({ status: 'loading' as const });
const DOCUMENT_ERROR = new Error('The editor document could not be projected.');
const CAPABILITIES_ERROR = new Error('The editor capabilities could not be projected.');

function ready<T>(data: T): LoadState<T> {
  return Object.freeze({ status: 'ready' as const, data });
}

function failed<T>(error: unknown): LoadState<T> {
  return Object.freeze({ status: 'error' as const, error });
}

function childListsEqual(left: ChildListSnapshot, right: ChildListSnapshot): boolean {
  return left.listType === right.listType
    && left.noteIds.length === right.noteIds.length
    && left.noteIds.every((noteId, index) => noteId === right.noteIds[index]);
}

function noteValuesEqual(
  previous: EditorNoteSnapshot,
  values: Pick<EditorNoteSnapshot, 'text' | 'checked' | 'folded'>,
  children: ChildListSnapshot | null,
): boolean {
  return previous.text === values.text
    && previous.checked === values.checked
    && previous.folded === values.folded
    && previous.children === children;
}

function previousChildList(
  previous: DocumentProjection | null,
  ownerId: NoteId | null,
): ChildListSnapshot | null {
  if (!previous) {
    return null;
  }
  return ownerId === null
    ? previous.snapshot.root
    : previous.snapshot.notes.get(ownerId)?.children ?? null;
}

function extractDocumentProjection(
  editorState: EditorState,
  documentId: string,
  previous: DocumentProjection | null,
): DocumentProjection {
  return editorState.read(() => {
    const rootList = $resolveRootContentList();
    if (!rootList) {
      throw new Error('Missing document root list.');
    }

    const noteValues = new Map<NoteId, Pick<EditorNoteSnapshot, 'text' | 'checked' | 'folded'>>();
    const childLists = new Map<NoteId | null, ChildListSnapshot>();
    const nodeKeys = new Map<NoteId, string>();
    const stack: Array<{ list: ListNode; ownerId: NoteId | null }> = [
      { list: rootList, ownerId: null },
    ];

    while (stack.length > 0) {
      const frame = stack.pop()!;
      const children = getContentSiblings(frame.list);
      const noteIds: NoteId[] = [];

      for (const note of children) {
        const noteId = $getNoteId(note);
        if (!noteId || noteId === documentId || noteValues.has(noteId)) {
          throw new Error('Invalid or duplicate editor note ID.');
        }

        noteValues.set(noteId, {
          text: getNoteOwnText(note),
          checked: $getNoteChecked(note) === true,
          folded: $isNoteFolded(note),
        });
        nodeKeys.set(noteId, note.getKey());
        noteIds.push(noteId);

        const nested = getNestedList(note);
        if (nested) {
          stack.push({ list: nested, ownerId: noteId });
        }
      }

      if (childLists.has(frame.ownerId)) {
        throw new Error('A note cannot own more than one child list.');
      }
      const candidate: ChildListSnapshot = {
        listType: frame.list.getListType(),
        noteIds: Object.freeze(noteIds),
      };
      const previousList = previousChildList(previous, frame.ownerId);
      childLists.set(
        frame.ownerId,
        previousList && childListsEqual(previousList, candidate)
          ? previousList
          : Object.freeze(candidate),
      );
    }

    const root = childLists.get(null);
    if (!root || root.noteIds.length === 0) {
      throw new Error('The document must contain at least one editor note.');
    }

    const notes = new Map<NoteId, EditorNoteSnapshot>();
    for (const [noteId, values] of noteValues) {
      const children = childLists.get(noteId) ?? null;
      const previousNote = previous?.snapshot.notes.get(noteId);
      notes.set(
        noteId,
        previousNote && noteValuesEqual(previousNote, values, children)
          ? previousNote
          : Object.freeze({ id: noteId, ...values, children }),
      );
    }

    const unchanged = previous !== null
      && root === previous.snapshot.root
      && notes.size === previous.snapshot.notes.size
      && [...notes].every(([noteId, note]) => previous.snapshot.notes.get(noteId) === note);
    const snapshot = unchanged
      ? previous.snapshot
      : Object.freeze({ documentId, root, notes: new ImmutableMapView(notes) });

    return { nodeKeys, snapshot };
  });
}

function capabilitySnapshotsEqual(
  left: DocumentCapabilitiesSnapshot,
  right: DocumentCapabilitiesSnapshot,
): boolean {
  return left.focus.canToggleFold === right.focus.canToggleFold
    && left.selection.canDelete === right.selection.canDelete
    && left.history.canUndo === right.history.canUndo
    && left.history.canRedo === right.history.canRedo;
}

function addressedNoteValuesEqual(
  left: AddressedNoteValues | null,
  right: AddressedNoteValues | null,
): boolean {
  return left === right
    || (left !== null
      && right !== null
      && left.folded === right.folded
      && left.text === right.text);
}

export function createLexicalDocumentSessionRuntime({
  editor,
  docId,
}: LexicalDocumentSessionSource): LexicalDocumentSessionRuntime {
  const documentListeners = new Set<() => void>();
  const capabilityListeners = new Set<() => void>();
  const addressedNotes = new Map<NoteId, AddressedNoteObservation>();
  let documentState: LoadState<DocumentSnapshot> = LOADING;
  let capabilityState: LoadState<DocumentCapabilitiesSnapshot> = LOADING;
  let projection: DocumentProjection | null = null;
  let latestEditorState = editor.getEditorState();
  let canUndo = false;
  let canRedo = false;
  let sourceReady = false;
  let documentActive = false;
  let capabilitiesActive = false;
  let documentDirty = false;
  let capabilitiesDirty = false;
  let addressedNotesDirty = false;
  let started = false;
  let disposed = false;
  let pending = false;
  let unregisterSource = () => {};
  let unregisterHistory = () => {};
  let historyObserved = false;

  const notify = (listeners: Set<() => void>) => {
    for (const listener of [...listeners]) {
      listener();
    }
  };

  const publishLoading = () => {
    projection = null;
    documentDirty = false;
    capabilitiesDirty = false;
    addressedNotesDirty = false;
    for (const observation of addressedNotes.values()) {
      observation.values = null;
    }
    const documentChanged = documentActive && documentState !== LOADING;
    const capabilitiesChanged = capabilitiesActive && capabilityState !== LOADING;
    documentState = LOADING;
    capabilityState = LOADING;
    // Assign both scopes before notifying either one so cross-scope reads stay
    // coherent across a source epoch and runtime stop.
    if (documentChanged) {
      notify(documentListeners);
    }
    if (capabilitiesChanged) {
      notify(capabilityListeners);
    }
  };

  const $resolveIndexedNote = (noteId: NoteId): ListItemNode | null => {
    const key = projection?.nodeKeys.get(noteId);
    if (key) {
      const node = $getNodeByKey(key);
      if (
        $isListItemNode(node)
        && node.isAttached()
        && !isWrapperItem(node)
        && $getNoteId(node) === noteId
      ) {
        return node;
      }
    }

    const note = $findNoteById(noteId);
    if (note) {
      projection?.nodeKeys.set(noteId, note.getKey());
    }
    return note;
  };

  const $resolveFocusedNote = (): ListItemNode | null => {
    const focusKey = $resolveFocusNoteKey(editor);
    const focusNode = focusKey ? $getNodeByKey(focusKey) : null;
    return $isListItemNode(focusNode) && !isWrapperItem(focusNode) ? focusNode : null;
  };

  const readAddressedNote = (noteId: NoteId): AddressedNoteValues | null => {
    if (disposed) {
      return null;
    }
    try {
      return editor.getEditorState().read(() => {
        const note = $resolveIndexedNote(noteId);
        return note
          ? { folded: $isNoteFolded(note), text: getNoteOwnText(note) }
          : null;
      }, { editor });
    } catch {
      return null;
    }
  };

  const requireAddressedNote = (noteId: NoteId): AddressedNoteValues => {
    const note = readAddressedNote(noteId);
    if (!note) {
      throw new Error(`Note "${noteId}" is not available in the open document.`);
    }
    return note;
  };

  const readCapabilitySnapshot = (): DocumentCapabilitiesSnapshot => latestEditorState.read(
    () => {
      const focusNote = $resolveFocusedNote();
      return Object.freeze({
        focus: Object.freeze({
          canToggleFold: focusNote ? $canOfferFold(editor, focusNote) : false,
        }),
        selection: Object.freeze({
          canDelete: $canDeleteFocusedOrSelectedNotes(editor),
        }),
        history: Object.freeze({ canUndo, canRedo }),
      });
    },
    { editor },
  );

  const resolveFoldTarget = (resolveNote: () => ListItemNode | null): string | null => {
    if (disposed || !started || !sourceReady) {
      return null;
    }
    try {
      return editor.read(() => {
        const note = resolveNote();
        return note && $canOfferFold(editor, note) ? note.getKey() : null;
      });
    } catch {
      return null;
    }
  };

  const toggleResolvedFold = (resolveNote: () => ListItemNode | null) => {
    const noteItemKey = resolveFoldTarget(resolveNote);
    if (noteItemKey) {
      editor.dispatchCommand(SET_NOTE_FOLD_COMMAND, { state: 'toggle', noteItemKey });
    }
  };

  const toggleResolvedFoldAfterCommit = async (resolveNote: () => ListItemNode | null): Promise<void> => {
    const noteItemKey = resolveFoldTarget(resolveNote);
    if (!noteItemKey) {
      return;
    }
    await new Promise<void>((resolve) => {
      editor.update(
        () => editor.dispatchCommand(SET_NOTE_FOLD_COMMAND, { state: 'toggle', noteItemKey }),
        { onUpdate: resolve },
      );
    });
  };

  const refresh = () => {
    pending = false;
    if (!started || disposed) {
      return;
    }

    let documentChanged = false;
    let capabilitiesChanged = false;
    const addressedListeners = new Set<() => void>();

    if (!sourceReady) {
      publishLoading();
      return;
    }

    if (documentActive && documentDirty) {
      documentDirty = false;
      try {
        const nextProjection = extractDocumentProjection(latestEditorState, docId, projection);
        const nextState = ready(nextProjection.snapshot);
        if (
          nextState.status !== documentState.status
          || (nextState.status === 'ready'
            && (documentState.status !== 'ready' || nextState.data !== documentState.data))
        ) {
          documentState = nextState;
          documentChanged = true;
        }
        projection = nextProjection;
      } catch {
        const nextState = failed<DocumentSnapshot>(DOCUMENT_ERROR);
        if (documentState.status !== 'error' || documentState.error !== DOCUMENT_ERROR) {
          documentState = nextState;
          documentChanged = true;
        }
        projection = null;
      }
    }

    if (capabilitiesActive && capabilitiesDirty) {
      capabilitiesDirty = false;
      try {
        const nextCapabilities = readCapabilitySnapshot();
        if (
          capabilityState.status !== 'ready'
          || !capabilitySnapshotsEqual(capabilityState.data, nextCapabilities)
        ) {
          capabilityState = ready(nextCapabilities);
          capabilitiesChanged = true;
        }
      } catch {
        if (capabilityState.status !== 'error' || capabilityState.error !== CAPABILITIES_ERROR) {
          capabilityState = failed<DocumentCapabilitiesSnapshot>(CAPABILITIES_ERROR);
          capabilitiesChanged = true;
        }
      }
    }

    if (addressedNotesDirty) {
      addressedNotesDirty = false;
      for (const [noteId, observation] of addressedNotes) {
        const next = readAddressedNote(noteId);
        if (!addressedNoteValuesEqual(observation.values, next)) {
          observation.values = next;
          for (const listener of observation.listeners) {
            addressedListeners.add(listener);
          }
        }
      }
    }

    // Assign both values before either listener set runs: consumers reading
    // across scopes cannot observe a torn source revision.
    if (documentChanged) {
      notify(documentListeners);
    }
    if (capabilitiesChanged) {
      notify(capabilityListeners);
    }
    notify(addressedListeners);
  };

  const schedule = () => {
    if (!started || disposed || pending) {
      return;
    }
    pending = true;
    // Lexical update listeners still run inside its update guard. Publish at a
    // later checkpoint so an SDK listener can safely invoke another operation.
    queueMicrotask(() => {
      queueMicrotask(refresh);
    });
  };

  const observeHistory = () => {
    if (historyObserved) {
      return;
    }
    historyObserved = true;
    unregisterHistory = mergeRegister(
      editor.registerCommand(
        CAN_UNDO_COMMAND,
        (nextCanUndo) => {
          canUndo = nextCanUndo;
          if (capabilitiesActive) {
            capabilitiesDirty = true;
            schedule();
          }
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        CAN_REDO_COMMAND,
        (nextCanRedo) => {
          canRedo = nextCanRedo;
          if (capabilitiesActive) {
            capabilitiesDirty = true;
            schedule();
          }
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  };

  const activateDocument = () => {
    if (documentActive) {
      return;
    }
    documentActive = true;
    documentDirty = true;
    latestEditorState = editor.getEditorState();
    if (started) {
      refresh();
    }
  };

  const subscribeDocument = (listener: () => void) => {
    if (disposed) {
      return () => {};
    }
    documentListeners.add(listener);
    activateDocument();
    return () => {
      documentListeners.delete(listener);
      if (documentListeners.size === 0) {
        documentActive = false;
        documentDirty = false;
        projection = null;
        documentState = LOADING;
      }
    };
  };

  const activateCapabilities = () => {
    if (capabilitiesActive) {
      return;
    }
    capabilitiesActive = true;
    capabilitiesDirty = true;
    latestEditorState = editor.getEditorState();
    if (started) {
      refresh();
    }
  };

  const stop = () => {
    if (!started) {
      return;
    }
    started = false;
    pending = false;
    unregisterSource();
    unregisterSource = () => {};
    publishLoading();
  };

  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    stop();
    unregisterHistory();
    unregisterHistory = () => {};
    documentActive = false;
    capabilitiesActive = false;
    documentListeners.clear();
    capabilityListeners.clear();
    addressedNotes.clear();
  };

  const createNote = (noteId: NoteId): OpenDocumentNote => {
    const handle: OpenDocumentNote = {
      id: () => noteId,
      text: () => requireAddressedNote(noteId).text,
      folded: () => requireAddressedNote(noteId).folded,
      toggleFold: () => toggleResolvedFoldAfterCommit(() => $resolveIndexedNote(noteId)),
      subscribe: (listener) => {
        if (disposed) {
          return () => {};
        }
        let observation = addressedNotes.get(noteId);
        if (!observation) {
          observation = {
            listeners: new Set(),
            values: readAddressedNote(noteId),
          };
          addressedNotes.set(noteId, observation);
        }
        observation.listeners.add(listener);
        return () => {
          observation.listeners.delete(listener);
          if (observation.listeners.size === 0) {
            addressedNotes.delete(noteId);
          }
        };
      },
    };
    return Object.freeze(handle);
  };

  const session: DocumentSession = {
    documentId: docId,
    document: {
      getSnapshot: () => documentState,
      subscribe: subscribeDocument,
    },
    capabilities: {
      getSnapshot: () => capabilityState,
      subscribe: (listener) => {
        if (disposed) {
          return () => {};
        }
        capabilityListeners.add(listener);
        activateCapabilities();
        return () => {
          capabilityListeners.delete(listener);
          if (capabilityListeners.size === 0) {
            capabilitiesActive = false;
            capabilitiesDirty = false;
            capabilityState = LOADING;
          }
        };
      },
    },
    note: createNote,
    focus: {
      toggleFold: () => toggleResolvedFold($resolveFocusedNote),
    },
    selection: {
      indent: () => {
        if (started && !disposed && sourceReady) editor.dispatchCommand(INDENT_NOTES_COMMAND, undefined);
      },
      outdent: () => {
        if (started && !disposed && sourceReady) editor.dispatchCommand(OUTDENT_NOTES_COMMAND, undefined);
      },
      moveUp: () => {
        if (started && !disposed && sourceReady) editor.dispatchCommand(REORDER_NOTES_UP_COMMAND, undefined);
      },
      moveDown: () => {
        if (started && !disposed && sourceReady) editor.dispatchCommand(REORDER_NOTES_DOWN_COMMAND, undefined);
      },
      toggleChecked: () => {
        if (started && !disposed && sourceReady) {
          editor.dispatchCommand(SET_NOTE_CHECKED_COMMAND, { state: 'toggle' });
        }
      },
      delete: () => {
        if (started && !disposed && sourceReady) editor.dispatchCommand(DELETE_SELECTED_NOTES_COMMAND, undefined);
      },
    },
    history: {
      undo: () => {
        if (started && !disposed && sourceReady) editor.dispatchCommand(UNDO_COMMAND, undefined);
      },
      redo: () => {
        if (started && !disposed && sourceReady) editor.dispatchCommand(REDO_COMMAND, undefined);
      },
    },
  };

  const start = () => {
    if (disposed) {
      return () => {};
    }
    if (started) {
      return stop;
    }
    started = true;
    latestEditorState = editor.getEditorState();
    observeHistory();

    unregisterSource = mergeRegister(
      editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
        latestEditorState = editorState;
        if (dirtyElements.size > 0 || dirtyLeaves.size > 0) {
          if (documentActive) {
            documentDirty = true;
          }
          if (addressedNotes.size > 0) {
            addressedNotesDirty = true;
          }
        }
        if (capabilitiesActive) {
          capabilitiesDirty = true;
        }
        if (documentDirty || capabilitiesDirty || addressedNotesDirty) {
          schedule();
        }
      }),
      subscribeViewRoot(editor, () => {
        if (capabilitiesActive) {
          capabilitiesDirty = true;
          schedule();
        }
      }),
    );

    documentDirty = documentActive;
    capabilitiesDirty = capabilitiesActive;
    addressedNotesDirty = addressedNotes.size > 0;
    refresh();
    return stop;
  };

  const setSourceReady = (nextReady: boolean) => {
    if (disposed || sourceReady === nextReady) {
      return;
    }
    sourceReady = nextReady;
    latestEditorState = editor.getEditorState();
    projection = null;
    if (!sourceReady) {
      canUndo = false;
      canRedo = false;
      publishLoading();
      return;
    }
    documentDirty = documentActive;
    capabilitiesDirty = capabilitiesActive;
    addressedNotesDirty = addressedNotes.size > 0;
    if (started) {
      schedule();
    }
  };

  return { dispose, session, setSourceReady, start };
}

export function useLexicalDocumentSession({
  editor,
  docId,
  ready: sourceReady = false,
}: UseLexicalDocumentSessionOptions): DocumentSession {
  const lifecycle = useMemo(
    () => ({
      generation: 0,
      runtime: createLexicalDocumentSessionRuntime({ editor, docId }),
    }),
    [docId, editor],
  );
  const { runtime } = lifecycle;
  useEffect(() => {
    const generation = ++lifecycle.generation;
    const stop = runtime.start();
    return () => {
      stop();
      queueMicrotask(() => {
        // React may replay an effect immediately in development. Dispose only
        // if no later setup reclaimed this memoized runtime.
        if (lifecycle.generation === generation) {
          runtime.dispose();
        }
      });
    };
  }, [lifecycle, runtime]);
  useEffect(() => runtime.setSourceReady(sourceReady), [runtime, sourceReady]);
  return runtime.session;
}
