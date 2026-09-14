import type { ListItemNode } from '@lexical/list';
import { $isListItemNode } from '@lexical/list';
import { mergeRegister } from '@lexical/utils';
import type { LexicalEditor } from 'lexical';
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
  DocumentCapabilitiesSnapshot,
  DocumentSession,
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
import { $isNoteFolded } from '#client/editor/outline/fold-state';
import { isWrapperItem } from '#client/editor/outline/list-structure';
import { $resolveFocusNoteKey } from '#client/editor/outline/note-context';
import { $canDeleteFocusedOrSelectedNotes } from '#client/editor/outline/selection/delete-selection';
import { getNoteOwnText } from '#client/editor/outline/selection/note-body';
import { $findNoteById } from '#client/editor/outline/note-traversal';
import { subscribeViewRoot } from '#client/editor/outline/view-root';
import { collectLexicalDocumentSearchResults } from './lexical-document-search';

interface LexicalDocumentSessionSource {
  editor: LexicalEditor;
  docId: string;
}

interface UseLexicalDocumentSessionOptions extends LexicalDocumentSessionSource {
  ready?: boolean;
}

interface AddressedNoteValues {
  folded: boolean;
  text: string;
}

interface AddressedNoteObservation {
  listeners: Set<() => void>;
  values: AddressedNoteValues | null;
}

export interface LexicalDocumentSessionRuntime {
  session: DocumentSession;
  start: () => () => void;
  setSourceReady: (ready: boolean) => void;
  dispose: () => void;
}

const LOADING = Object.freeze({ status: 'loading' as const });
const CAPABILITIES_ERROR = new Error('The editor capabilities could not be projected.');

function ready<T>(data: T): LoadState<T> {
  return Object.freeze({ status: 'ready' as const, data });
}

function failed<T>(error: unknown): LoadState<T> {
  return Object.freeze({ status: 'error' as const, error });
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
  const capabilityListeners = new Set<() => void>();
  const addressedNotes = new Map<NoteId, AddressedNoteObservation>();
  let capabilityState: LoadState<DocumentCapabilitiesSnapshot> = LOADING;
  let latestEditorState = editor.getEditorState();
  let canUndo = false;
  let canRedo = false;
  let sourceReady = false;
  let capabilitiesActive = false;
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
    capabilitiesDirty = false;
    addressedNotesDirty = false;
    for (const observation of addressedNotes.values()) {
      observation.values = null;
    }
    const capabilitiesChanged = capabilitiesActive && capabilityState !== LOADING;
    capabilityState = LOADING;
    if (capabilitiesChanged) {
      notify(capabilityListeners);
    }
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
        const note = $findNoteById(noteId);
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

    let capabilitiesChanged = false;
    const addressedListeners = new Set<() => void>();

    if (!sourceReady) {
      publishLoading();
      return;
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

    // Refresh observations before invoking listeners, which may mutate notes.
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
    capabilitiesActive = false;
    capabilityListeners.clear();
    addressedNotes.clear();
  };

  const createNoteRef = (noteId: NoteId): OpenDocumentNote => {
    const handle: OpenDocumentNote = {
      getId: () => noteId,
      getText: () => requireAddressedNote(noteId).text,
      getFolded: () => requireAddressedNote(noteId).folded,
      toggleFold: () => toggleResolvedFoldAfterCommit(() => $findNoteById(noteId)),
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
    search: async (options) => {
      if (disposed || !started || !sourceReady) {
        throw new Error('The document is not available for search.');
      }
      return collectLexicalDocumentSearchResults(editor, options);
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
    noteRef: createNoteRef,
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
          if (addressedNotes.size > 0) {
            addressedNotesDirty = true;
          }
        }
        if (capabilitiesActive) {
          capabilitiesDirty = true;
        }
        if (capabilitiesDirty || addressedNotesDirty) {
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
    if (!sourceReady) {
      canUndo = false;
      canRedo = false;
      publishLoading();
      return;
    }
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
