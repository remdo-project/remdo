<script setup lang="ts">
import { mergeRegister } from '@lexical/utils';
import {
  CONNECTED_COMMAND,
  TOGGLE_CONNECT_COMMAND,
  createBinding,
  createUndoManager,
  initLocalState,
  setLocalStateFocus,
  syncCursorPositions,
  syncLexicalUpdateToYjs,
  syncYjsChangesToLexical,
  type Binding,
  type Provider,
  type SyncCursorPositionsFn,
} from '@lexical/yjs';
import { HistoryPlugin as LexicalHistoryPlugin } from 'lexical-vue/LexicalHistoryPlugin';
import { useLexicalComposer } from 'lexical-vue/LexicalComposer';
import {
  BLUR_COMMAND,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_EDITOR,
  FOCUS_COMMAND,
  HISTORY_MERGE_TAG,
  REDO_COMMAND,
  SKIP_COLLAB_TAG,
  UNDO_COMMAND,
  $createParagraphNode,
  $getRoot,
  $getSelection,
  type InitialEditorStateType,
  type LexicalEditor,
} from 'lexical';
import { Teleport, defineComponent, h, onBeforeUnmount, onMounted, shallowRef } from 'vue';
import { UndoManager, type Doc } from 'yjs';
import CollaborationProvider from './CollaborationProvider.vue';
import { useCollaborationContext } from './context';
import { useCollaborationStatus } from './status';

const DEFAULT_ROOM_ID = 'main';

interface CollaborationOptions {
  editor: LexicalEditor;
  provider: Provider;
  binding: Binding;
  id: string;
  docMap: Map<string, Doc>;
  name: string;
  color: string;
  shouldBootstrap: boolean;
  initialEditorState?: InitialEditorStateType;
  awarenessData?: Record<string, unknown>;
  cursorsContainer?: () => HTMLElement | null;
  syncCursorPositionsFn?: SyncCursorPositionsFn;
}

interface CollaborationSetupResult {
  render: () => ReturnType<typeof h>;
  dispose: () => void;
}

function setupYjsCollaboration({
  editor,
  provider,
  binding,
  id,
  docMap,
  name,
  color,
  shouldBootstrap,
  initialEditorState,
  awarenessData,
  cursorsContainer,
  syncCursorPositionsFn = syncCursorPositions,
}: CollaborationOptions): CollaborationSetupResult {
  const disposers: Array<() => void> = [];
  const isReloadingDoc = { current: false };

  const docFromProvider = (provider as unknown as { doc?: Doc }).doc;
  if (docFromProvider && !docMap.has(id)) {
    docMap.set(id, docFromProvider);
  }

  const setDoc = (doc: Doc) => {
    docMap.set(id, doc);
  };

  const onBootstrap = () => {
    const { root } = binding;
    if (!shouldBootstrap) {
      return;
    }
    if (!root.isEmpty() || root._xmlText._length !== 0) {
      return;
    }

    initializeEditor(editor, initialEditorState);
  };

  const onYjsTreeChanges = (events: Array<unknown>, transaction: { origin: unknown }) => {
    const { origin } = transaction;
    if (origin === binding) {
      return;
    }

    const isFromUndoManager = origin instanceof UndoManager;
    syncYjsChangesToLexical(binding, provider, events, isFromUndoManager, syncCursorPositionsFn);
  };

  const sharedRoot = binding.root.getSharedType();
  sharedRoot.observeDeep(onYjsTreeChanges);
  disposers.push(() => {
    sharedRoot.unobserveDeep(onYjsTreeChanges);
  });

  const unregisterUpdates = editor.registerUpdateListener(
    ({ prevEditorState, editorState, dirtyLeaves, dirtyElements, normalizedNodes, tags }) => {
      if (tags.has(SKIP_COLLAB_TAG)) {
        return;
      }

      syncLexicalUpdateToYjs(
        binding,
        provider,
        prevEditorState,
        editorState,
        dirtyElements,
        dirtyLeaves,
        normalizedNodes,
        tags,
      );
    },
  );
  disposers.push(unregisterUpdates);

  const onProviderDocReload = (ydoc: Doc) => {
    clearEditorSkipCollab(editor, binding);
    setDoc(ydoc);
    isReloadingDoc.current = true;
  };

  const onSync = (isSynced: boolean) => {
    if (isSynced) {
      isReloadingDoc.current = false;
      onBootstrap();
    }
  };

  provider.on('reload', onProviderDocReload);
  provider.on('sync', onSync);
  disposers.push(() => {
    provider.off('reload', onProviderDocReload);
    provider.off('sync', onSync);
  });

  const connect = () => provider.connect();
  const disconnect = () => {
    try {
      provider.disconnect();
    } catch {
      // ignore
    }
  };

  const onStatus = ({ status }: { status: string }) => {
    editor.dispatchCommand(CONNECTED_COMMAND, status === 'connected');
  };

  initLocalState(
    provider,
    name,
    color,
    document.activeElement === editor.getRootElement(),
    awarenessData ?? {},
  );

  provider.on('status', onStatus);
  const connectionResult = connect();

  disposers.push(() => {
    if (isReloadingDoc.current === false) {
      if (connectionResult && typeof (connectionResult as Promise<void>).then === 'function') {
        (connectionResult as Promise<void>)
          .then(disconnect)
          .catch(() => {
            disconnect();
          });
      } else {
        disconnect();
      }
    }
    provider.off('status', onStatus);
  });

  const unregisterToggle = editor.registerCommand(
    TOGGLE_CONNECT_COMMAND,
    (payload: boolean) => {
      if (payload) {
        connect();
      } else {
        disconnect();
      }
      return true;
    },
    COMMAND_PRIORITY_EDITOR,
  );
  disposers.push(unregisterToggle);

  const unregisterFocus = mergeRegister(
    editor.registerCommand(
      FOCUS_COMMAND,
      () => {
        setLocalStateFocus(provider, name, color, true, awarenessData ?? {});
        return false;
      },
      COMMAND_PRIORITY_EDITOR,
    ),
    editor.registerCommand(
      BLUR_COMMAND,
      () => {
        setLocalStateFocus(provider, name, color, false, awarenessData ?? {});
        return false;
      },
      COMMAND_PRIORITY_EDITOR,
    ),
  );
  disposers.push(unregisterFocus);

  const undoManager = createUndoManager(binding, binding.root.getSharedType());

  const unregisterUndoRedo = mergeRegister(
    editor.registerCommand(
      UNDO_COMMAND,
      () => {
        undoManager.undo();
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    ),
    editor.registerCommand(
      REDO_COMMAND,
      () => {
        undoManager.redo();
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    ),
  );
  disposers.push(unregisterUndoRedo);

  const updateUndoRedoStates = () => {
    editor.dispatchCommand(CAN_UNDO_COMMAND, undoManager.undoStack.length > 0);
    editor.dispatchCommand(CAN_REDO_COMMAND, undoManager.redoStack.length > 0);
  };

  undoManager.on('stack-item-added', updateUndoRedoStates);
  undoManager.on('stack-item-popped', updateUndoRedoStates);
  undoManager.on('stack-cleared', updateUndoRedoStates);
  disposers.push(() => {
    undoManager.off('stack-item-added', updateUndoRedoStates);
    undoManager.off('stack-item-popped', updateUndoRedoStates);
    undoManager.off('stack-cleared', updateUndoRedoStates);
  });

  const render = () => {
    const target = cursorsContainer?.() ?? document.body;
    return h(
      Teleport,
      { to: target },
      h('div', {
        ref: (element: HTMLElement | null) => {
          binding.cursorsContainer = element ?? undefined;
        },
      }),
    );
  };

  const dispose = () => {
    binding.cursorsContainer = undefined;
    undoManager.clear();
    while (disposers.length > 0) {
      const fn = disposers.pop();
      try {
        fn?.();
      } catch {
        // ignore cleanup errors
      }
    }
  };

  return { render, dispose };
}

function initializeEditor(editor: LexicalEditor, initialEditorState?: InitialEditorStateType) {
  editor.update(
    () => {
      const root = $getRoot();
      if (!root.isEmpty()) {
        return;
      }

      if (initialEditorState) {
        if (typeof initialEditorState === 'string') {
          const parsed = editor.parseEditorState(initialEditorState);
          editor.setEditorState(parsed, { tag: HISTORY_MERGE_TAG });
          return;
        }

        if (typeof initialEditorState === 'function') {
          editor.update(
            () => {
              const nestedRoot = $getRoot();
              if (nestedRoot.isEmpty()) {
                initialEditorState(editor);
              }
            },
            { tag: HISTORY_MERGE_TAG },
          );
          return;
        }

        editor.setEditorState(initialEditorState, { tag: HISTORY_MERGE_TAG });
        return;
      }

      const paragraph = $createParagraphNode();
      root.append(paragraph);
      const selection = $getSelection();
      if (selection !== null) {
        return;
      }

      const activeElement = document.activeElement;
      if (activeElement && activeElement === editor.getRootElement()) {
        paragraph.select();
      }
    },
    { tag: HISTORY_MERGE_TAG },
  );
}

function clearEditorSkipCollab(editor: LexicalEditor, binding: Binding) {
  editor.update(
    () => {
      const root = $getRoot();
      root.clear();
      root.select();
    },
    { tag: SKIP_COLLAB_TAG },
  );

  const cursors = binding.cursors;
  const container = binding.cursorsContainer;

  if (!cursors || !container) {
    return;
  }

  for (const cursor of cursors.values()) {
    const selection = cursor.selection;
    if (!selection || !selection.selections) {
      continue;
    }

    for (const domSelection of selection.selections) {
      if (domSelection.parentNode === container) {
        container.removeChild(domSelection);
      }
    }
  }
}

const CollaborationRuntimePlugin = defineComponent({
  name: 'CollaborationRuntimePlugin',
  setup() {
    const status = useCollaborationStatus();

    if (!status.enabled) {
      return () => h(LexicalHistoryPlugin);
    }

    const editor = useLexicalComposer();
    const collabContext = useCollaborationContext();

    const renderedCursors = shallowRef<ReturnType<typeof h> | null>(null);
    const cleanupStack: Array<() => void> = [];

    const docId = DEFAULT_ROOM_ID;

    onMounted(() => {
      collabContext.isCollabActive = true;

      const provider = status.providerFactory(docId, collabContext.yjsDocMap);
      const doc = collabContext.yjsDocMap.get(docId);

      const binding = createBinding(
        editor,
        provider,
        docId,
        doc ?? collabContext.yjsDocMap.get(docId),
        collabContext.yjsDocMap,
      );

      collabContext.yjsDocMap.set(docId, binding.doc);

      cleanupStack.push(() => {
        binding.root.destroy(binding);
      });

      const { render, dispose } = setupYjsCollaboration({
        editor,
        provider,
        binding,
        id: docId,
        docMap: collabContext.yjsDocMap,
        name: collabContext.name,
        color: collabContext.color,
        shouldBootstrap: true,
      });

      renderedCursors.value = render;

      cleanupStack.push(() => {
        dispose();
        if (typeof (provider as { destroy?: () => void }).destroy === 'function') {
          (provider as { destroy: () => void }).destroy();
        } else {
          try {
            provider.disconnect();
          } catch {
            // ignore
          }
        }
      });
    });

    onBeforeUnmount(() => {
      if (editor._parentEditor == null) {
        collabContext.isCollabActive = false;
      }

      while (cleanupStack.length > 0) {
        const fn = cleanupStack.pop();
        try {
          fn?.();
        } catch {
          // ignore cleanup errors
        }
      }
    });

    return () => renderedCursors.value?.() ?? null;
  },
});
</script>

<template>
  <CollaborationProvider>
    <slot />
    <CollaborationRuntimePlugin />
  </CollaborationProvider>
</template>
