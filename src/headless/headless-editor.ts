import { createProviderFactory } from '#collaboration/runtime';
import {
  createBindingV2__EXPERIMENTAL,
  syncLexicalUpdateToYjsV2__EXPERIMENTAL,
  syncYjsChangesToLexicalV2__EXPERIMENTAL,
  syncYjsStateToLexicalV2__EXPERIMENTAL,
} from '@lexical/yjs';
import { createEditor } from 'lexical';
import { HocuspocusProvider } from '@hocuspocus/provider';
import WebSocket from 'ws';
import { UndoManager } from 'yjs';
import type { Doc, Transaction } from 'yjs';
import type { CreateEditorArgs, LexicalEditor } from 'lexical';

import { config } from '#config';
import { resolveCollabServerOrigin } from '#platform/net/origins';
import { requestPersistence } from '#collaboration/persistence-barrier';
import { CollabSession } from '#collaboration/session';
import { createEditorInitialConfig } from '#client/editor/runtime/config';

type SharedRootObserver = (
  events: Parameters<typeof syncYjsChangesToLexicalV2__EXPERIMENTAL>[2],
  transaction: Transaction,
) => void;

interface SharedRoot {
  observeDeep: (callback: SharedRootObserver) => void;
  unobserveDeep: (callback: SharedRootObserver) => void;
}

function createInternalProviderFactory() {
  class OperatorWebSocket extends WebSocket {
    constructor(url: string | URL) {
      super(url, { headers: { 'X-Remdo-Collaboration-Secret': config.env.COLLAB_INTERNAL_SECRET } });
    }
  }
  return createProviderFactory({
    visibleOrigin: resolveCollabServerOrigin(),
    WebSocketPolyfill: OperatorWebSocket as unknown as typeof globalThis.WebSocket,
  });
}

/**
 * Resolve once the editor emits its next update. Useful for awaiting a
 * `setEditorState` flush from inside a `run` callback.
 */
export function waitForEditorUpdate(editor: LexicalEditor): Promise<void> {
  return new Promise((resolve) => {
    const unregister = editor.registerUpdateListener(() => {
      unregister();
      resolve();
    });
  });
}

interface HeadlessEditorControls {
  /** Resolves after the database commits the document's current state. */
  persist: () => Promise<void>;
}

/**
 * Attach a headless Lexical editor to a collab document and run
 * `run(editor, controls)` once the initial Yjs state has synced into the
 * editor. Used to read documents out (snapshot) and to write content in
 * (dev data seeding) without a browser.
 *
 * If `run` mutates the editor (e.g. `setEditorState`), it should await that
 * update's flush (see `waitForEditorUpdate`) before calling `persist` or
 * returning, so the write reaches the server.
 */
export async function withHeadlessEditor<T>(
  docId: string,
  run: (editor: LexicalEditor, controls: HeadlessEditorControls) => Promise<T> | T,
): Promise<T> {
  const docMap = new Map<string, Doc>();
  const session = new CollabSession({
    enabled: true,
    docId,
    origin: resolveCollabServerOrigin(),
    providerFactory: createInternalProviderFactory(),
  });
  session.attach(docMap);
  const provider = session.getProvider();
  const syncDoc = docMap.get(docId);
  if (!(provider instanceof HocuspocusProvider) || !syncDoc) {
    session.destroy();
    throw new Error('Collaboration provider unavailable');
  }
  const editor = createEditor(createEditorInitialConfig() as CreateEditorArgs);
  const binding = createBindingV2__EXPERIMENTAL(editor, docId, syncDoc, docMap);
  const sharedRoot = binding.root as SharedRoot;
  const observer: SharedRootObserver = (events, transaction) => {
    if (transaction.origin === binding) {
      return;
    }
    syncYjsChangesToLexicalV2__EXPERIMENTAL(
      binding,
      provider,
      events,
      transaction,
      transaction.origin instanceof UndoManager,
    );
  };
  sharedRoot.observeDeep(observer);
  const removeUpdateListener = editor.registerUpdateListener((payload) => {
    const { prevEditorState, editorState, dirtyElements, dirtyLeaves, normalizedNodes, tags } = payload;
    syncLexicalUpdateToYjsV2__EXPERIMENTAL(
      binding,
      provider,
      prevEditorState,
      editorState,
      dirtyElements,
      dirtyLeaves,
      normalizedNodes,
      tags,
    );
  });

  let result: T;
  try {
    void provider.connect();
    await session.awaitSynced();
    const initialUpdate = waitForEditorUpdate(editor);
    syncYjsStateToLexicalV2__EXPERIMENTAL(binding, provider);
    await initialUpdate;

    result = await run(editor, {
      persist: async () => {
        await session.awaitSynced();
        await requestPersistence(provider);
      },
    });
    await session.awaitSynced();
  } finally {
    sharedRoot.unobserveDeep(observer);
    removeUpdateListener();
    session.destroy();
    for (const doc of docMap.values()) {
      doc.destroy();
    }
  }

  return result;
}
