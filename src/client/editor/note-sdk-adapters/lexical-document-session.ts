import type { ListItemNode } from '@lexical/list';
import { $isListItemNode } from '@lexical/list';
import { mergeRegister } from '@lexical/utils';
import type { LexicalEditor } from 'lexical';
import {
  $getNodeByKey,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_LOW,
  HISTORY_PUSH_TAG,
  REDO_COMMAND,
  UNDO_COMMAND,
} from 'lexical';
import { useEffect, useMemo } from 'react';
import type {
  DocumentSession,
  NoteId,
  OpenDocumentNote,
  NoteListType,
} from '#note-sdk';
import { IneligibleOperationError, NoteUnavailableError } from '#note-sdk';
import { $toggleNoteCheckedForTargets } from '#client/editor/features/list-types/checked-operations';
import { $getNoteChecked } from '#client/editor/features/list-types/checked-state';
import { $getNestedListType } from '#client/editor/features/list-types/nested-list-type';
import {
  DELETE_SELECTED_NOTES_COMMAND,
  FOLD_VIEW_TO_LEVEL_COMMAND,
  INDENT_NOTES_COMMAND,
  OUTDENT_NOTES_COMMAND,
  REORDER_NOTES_DOWN_COMMAND,
  REORDER_NOTES_UP_COMMAND,
  SET_NOTE_CHECKED_COMMAND,
  SET_NOTE_FOLD_COMMAND,
  SET_NESTED_LIST_TYPE_COMMAND,
  ZOOM_OUT_COMMAND,
  ZOOM_TO_NOTE_COMMAND,
} from '#client/editor/foundation/commands';
import { $canOfferFold } from '#client/editor/features/folding/fold-offer';
import { $isNoteFolded } from '#client/editor/outline/fold-state';
import { $getOrCreateChildList, isWrapperItem } from '#client/editor/outline/list-structure';
import { $resolveFocusNoteKey } from '#client/editor/outline/note-context';
import { $canDeleteFocusedOrSelectedNotes } from '#client/editor/outline/selection/delete-selection';
import { getNoteOwnText } from '#client/editor/outline/selection/note-body';
import { $findNoteById } from '#client/editor/outline/note-traversal';
import { isWithinBoundary, noteHasChildren } from '#client/editor/outline/selection/tree';
import { $requireRootContentList } from '#client/editor/outline/schema';
import { $resolveViewRoot, subscribeViewRoot } from '#client/editor/outline/view-root';
import { collectLexicalDocumentSearchResults } from './lexical-document-search';
import { $appendNewNotes, hasLineBreak } from './lexical-note-insertion';

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
  checked: boolean;
  childListType: NoteListType | null;
  canToggleFold: boolean;
}

interface AddressedNoteObservation {
  listeners: Set<() => void>;
  values: AddressedNoteValues | null | undefined;
}

export interface LexicalDocumentSessionRuntime {
  session: DocumentSession;
  start: () => () => void;
  setSourceReady: (ready: boolean) => void;
  dispose: () => void;
}

interface CapabilityValues {
  canToggleFold: boolean;
  canDelete: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

function capabilityValuesEqual(left: CapabilityValues | null, right: CapabilityValues | null): boolean {
  return left === right || (left !== null && right !== null
    && left.canToggleFold === right.canToggleFold
    && left.canDelete === right.canDelete
    && left.canUndo === right.canUndo
    && left.canRedo === right.canRedo);
}

function addressedNoteValuesEqual(
  left: AddressedNoteValues | null,
  right: AddressedNoteValues | null,
): boolean {
  return left === right
    || (left !== null
      && right !== null
      && left.folded === right.folded
      && left.checked === right.checked
      && left.childListType === right.childListType
      && left.canToggleFold === right.canToggleFold
      && left.text === right.text);
}

export function createLexicalDocumentSessionRuntime({
  editor,
  docId,
}: LexicalDocumentSessionSource): LexicalDocumentSessionRuntime {
  const capabilityListeners = new Set<() => void>();
  const addressedNotes = new Map<NoteId, AddressedNoteObservation>();
  let capabilityValues: CapabilityValues | null | undefined = null;
  let canUndo = false;
  let canRedo = false;
  let sourceReady = false;
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

  const publishUnavailable = () => {
    capabilitiesDirty = false;
    addressedNotesDirty = false;
    const addressedListeners = new Set<() => void>();
    for (const observation of addressedNotes.values()) {
      if (observation.values !== null) {
        observation.values = null;
        for (const listener of observation.listeners) {
          addressedListeners.add(listener);
        }
      }
    }
    const capabilitiesChanged = capabilityListeners.size > 0 && capabilityValues !== null;
    capabilityValues = null;
    if (capabilitiesChanged) {
      notify(capabilityListeners);
    }
    notify(addressedListeners);
  };

  const $resolveFocusedNote = (): ListItemNode | null => {
    const focusKey = $resolveFocusNoteKey(editor);
    const focusNode = focusKey ? $getNodeByKey(focusKey) : null;
    return $isListItemNode(focusNode) && !isWrapperItem(focusNode) ? focusNode : null;
  };

  const readAddressedNote = (noteId: NoteId): AddressedNoteValues | null => {
    if (!started || disposed || !sourceReady) {
      return null;
    }
    return editor.getEditorState().read(() => {
      const note = $findNoteById(noteId);
      if (!note) return null;
      return {
        folded: $isNoteFolded(note),
        text: getNoteOwnText(note),
        checked: $getNoteChecked(note) === true,
        childListType: $getNestedListType(note),
        canToggleFold: noteHasChildren(note),
      };
    }, { editor });
  };

  const readNoteObservation = (noteId: NoteId): AddressedNoteValues | null | undefined => {
    try {
      return readAddressedNote(noteId);
    } catch {
      // Invalidate the observation; consumers reread to receive the original error.
      return undefined;
    }
  };

  const requireAddressedNote = (noteId: NoteId): AddressedNoteValues => {
    const note = readAddressedNote(noteId);
    if (!note) {
      throw new NoteUnavailableError(noteId);
    }
    return note;
  };

  const readCanToggleFold = () => {
    if (!started || disposed || !sourceReady) return false;
    return editor.getEditorState().read(() => {
      const note = $resolveFocusedNote();
      return note ? $canOfferFold(editor, note) : false;
    }, { editor });
  };

  const readCanDelete = () => {
    if (!started || disposed || !sourceReady) return false;
    return editor.getEditorState().read(() => $canDeleteFocusedOrSelectedNotes(editor), { editor });
  };

  const readCanUndo = () => {
    if (!started || disposed || !sourceReady) return false;
    return canUndo;
  };

  const readCanRedo = () => {
    if (!started || disposed || !sourceReady) return false;
    return canRedo;
  };

  const readCapabilityObservation = (): CapabilityValues | null | undefined => {
    if (!started || disposed || !sourceReady) return null;
    try {
      return {
        canToggleFold: readCanToggleFold(),
        canDelete: readCanDelete(),
        canUndo: readCanUndo(),
        canRedo: readCanRedo(),
      };
    } catch {
      // Consumers reread to receive the original failure and can observe recovery.
      return undefined;
    }
  };

  const toggleFocusedFold = () => {
    if (disposed || !started || !sourceReady) {
      return;
    }
    let noteItemKey: string | null;
    try {
      noteItemKey = editor.read(() => {
        const note = $resolveFocusedNote();
        return note && $canOfferFold(editor, note) ? note.getKey() : null;
      });
    } catch {
      return;
    }
    if (noteItemKey) {
      editor.dispatchCommand(SET_NOTE_FOLD_COMMAND, { state: 'toggle', noteItemKey });
    }
  };

  const updateDocument = <T>(operation: () => T, tag?: typeof HISTORY_PUSH_TAG): Promise<T> => {
    if (!started || disposed || !sourceReady) {
      return Promise.reject(new IneligibleOperationError('The document is not available.'));
    }
    return new Promise<T>((resolve, reject) => {
      let result: T;
      editor.update(() => {
        try {
          result = operation();
        } catch (error) {
          reject(error);
          // An ineligible operation throws before mutating, so nothing needs recovery.
          if (error instanceof IneligibleOperationError) return;
          // Preserve Lexical's recovery even when the host reports without rethrowing.
          throw error;
        }
      }, { onUpdate: () => resolve(result), tag });
    });
  };

  const $requireNote = (noteId: NoteId): ListItemNode => {
    const note = $findNoteById(noteId);
    if (!note) {
      throw new IneligibleOperationError(`Note "${noteId}" is not available.`);
    }
    return note;
  };

  const updateAddressedNote = (
    noteId: NoteId,
    operation: (note: ListItemNode) => void,
  ): Promise<void> => updateDocument(() => {
    operation($requireNote(noteId));
  });

  const insertNotes: DocumentSession['insertNotes'] = ({ parentNoteId, notes }) => updateDocument(() => {
    if (hasLineBreak(notes)) {
      throw new IneligibleOperationError('Note text cannot contain a line break.');
    }
    const parent = parentNoteId === undefined ? null : $requireNote(parentNoteId);
    if (notes.length === 0) {
      return [];
    }
    return $appendNewNotes(parent ? $getOrCreateChildList(parent) : $requireRootContentList(), notes);
  }, HISTORY_PUSH_TAG);

  const refresh = () => {
    pending = false;
    if (!started || disposed) {
      return;
    }

    let capabilitiesChanged = false;
    const addressedListeners = new Set<() => void>();

    if (!sourceReady) {
      publishUnavailable();
      return;
    }

    if (capabilityListeners.size > 0 && capabilitiesDirty) {
      capabilitiesDirty = false;
      const next = readCapabilityObservation();
      capabilitiesChanged = capabilityValues === undefined || next === undefined
        || !capabilityValuesEqual(capabilityValues, next);
      capabilityValues = next;
    }

    if (addressedNotesDirty) {
      addressedNotesDirty = false;
      for (const [noteId, observation] of addressedNotes) {
        const next = readNoteObservation(noteId);
        if (observation.values === undefined || next === undefined || !addressedNoteValuesEqual(observation.values, next)) {
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
          if (capabilityListeners.size > 0) {
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
          if (capabilityListeners.size > 0) {
            capabilitiesDirty = true;
            schedule();
          }
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  };

  const stop = () => {
    if (!started) {
      return;
    }
    started = false;
    pending = false;
    unregisterSource();
    unregisterSource = () => {};
    publishUnavailable();
  };

  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    stop();
    unregisterHistory();
    unregisterHistory = () => {};
    capabilityListeners.clear();
    addressedNotes.clear();
  };

  const createNoteRef = (noteId: NoteId): OpenDocumentNote => {
    const handle: OpenDocumentNote = {
      getId: () => noteId,
      getText: () => requireAddressedNote(noteId).text,
      getFolded: () => requireAddressedNote(noteId).folded,
      getChecked: () => requireAddressedNote(noteId).checked,
      getChildListType: () => requireAddressedNote(noteId).childListType,
      canToggleFold: () => readAddressedNote(noteId)?.canToggleFold ?? false,
      canToggleChecked: () => readAddressedNote(noteId) !== null,
      canSetChildListType: () => (readAddressedNote(noteId)?.childListType ?? null) !== null,
      toggleFold: () => updateAddressedNote(noteId, (note) => {
        if (!noteHasChildren(note)) {
          throw new IneligibleOperationError('Only a note with children can fold.');
        }
        editor.dispatchCommand(SET_NOTE_FOLD_COMMAND, { state: 'toggle', noteItemKey: note.getKey() });
      }),
      toggleChecked: () => updateAddressedNote(noteId, (note) => $toggleNoteCheckedForTargets([note])),
      setChildListType: (listType) => updateAddressedNote(noteId, (note) => {
        if ($getNestedListType(note) === null) {
          throw new IneligibleOperationError('Only a note with children has a child list.');
        }
        editor.dispatchCommand(SET_NESTED_LIST_TYPE_COMMAND, { listType, noteItemKey: note.getKey() });
      }),
      zoom: () => {
        if (started && !disposed && sourceReady && readAddressedNote(noteId)) {
          editor.dispatchCommand(ZOOM_TO_NOTE_COMMAND, { noteId });
        }
      },
      subscribe: (listener) => {
        if (disposed) {
          return () => {};
        }
        let observation = addressedNotes.get(noteId);
        if (!observation) {
          observation = {
            listeners: new Set(),
            values: readNoteObservation(noteId),
          };
          addressedNotes.set(noteId, observation);
        }
        const registration = () => {
          if (observation.listeners.has(registration)) listener();
        };
        observation.listeners.add(registration);
        return () => {
          if (!observation.listeners.delete(registration)) return;
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
    subscribeCapabilities: (listener) => {
      if (disposed) return () => {};
      if (capabilityListeners.size === 0) {
        capabilityValues = readCapabilityObservation();
      }
      const registration = () => {
        if (capabilityListeners.has(registration)) listener();
      };
      capabilityListeners.add(registration);
      return () => {
        if (!capabilityListeners.delete(registration)) return;
        if (capabilityListeners.size === 0) {
          capabilitiesDirty = false;
          capabilityValues = null;
        }
      };
    },
    noteRef: createNoteRef,
    insertNotes,
    view: {
      zoomOut: () => {
        if (started && !disposed && sourceReady) editor.dispatchCommand(ZOOM_OUT_COMMAND, undefined);
      },
      foldToLevel: (level) => {
        if (started && !disposed && sourceReady) editor.dispatchCommand(FOLD_VIEW_TO_LEVEL_COMMAND, { level });
      },
    },
    focus: {
      canToggleFold: readCanToggleFold,
      toggleFold: toggleFocusedFold,
    },
    selection: {
      canDelete: readCanDelete,
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
      toggleChecked: (target) => {
        if (!started || disposed || !sourceReady) return;
        if (!target) {
          editor.dispatchCommand(SET_NOTE_CHECKED_COMMAND, { state: 'toggle' });
          return;
        }
        editor.update(() => {
          const note = $findNoteById(target.noteId);
          if (note && isWithinBoundary(note, $resolveViewRoot(editor))) {
            editor.dispatchCommand(SET_NOTE_CHECKED_COMMAND, { state: 'toggle', noteItemKey: note.getKey() });
          }
        });
      },
      delete: () => {
        if (started && !disposed && sourceReady) editor.dispatchCommand(DELETE_SELECTED_NOTES_COMMAND, undefined);
      },
    },
    history: {
      canUndo: readCanUndo,
      canRedo: readCanRedo,
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
    observeHistory();

    unregisterSource = mergeRegister(
      editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
        if (dirtyElements.size > 0 || dirtyLeaves.size > 0) {
          if (addressedNotes.size > 0) {
            addressedNotesDirty = true;
          }
        }
        if (capabilityListeners.size > 0) {
          capabilitiesDirty = true;
        }
        if (capabilitiesDirty || addressedNotesDirty) {
          schedule();
        }
      }),
      subscribeViewRoot(editor, () => {
        if (capabilityListeners.size > 0) {
          capabilitiesDirty = true;
          schedule();
        }
      }),
    );

    capabilitiesDirty = capabilityListeners.size > 0;
    addressedNotesDirty = addressedNotes.size > 0;
    refresh();
    return stop;
  };

  const setSourceReady = (nextReady: boolean) => {
    if (disposed || sourceReady === nextReady) {
      return;
    }
    sourceReady = nextReady;
    if (!sourceReady) {
      publishUnavailable();
      return;
    }
    capabilitiesDirty = capabilityListeners.size > 0;
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
