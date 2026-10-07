import { createProviderFactory } from '#collaboration/runtime';
import {
  createBindingV2__EXPERIMENTAL,
  syncLexicalUpdateToYjsV2__EXPERIMENTAL,
  syncYjsChangesToLexicalV2__EXPERIMENTAL,
  syncYjsStateToLexicalV2__EXPERIMENTAL,
} from '@lexical/yjs';
import type { Provider } from '@lexical/yjs';
import { createEditor } from 'lexical';
import { HocuspocusProvider } from '@hocuspocus/provider';
import WebSocket from 'ws';
import { UndoManager } from 'yjs';
import type { Doc, Transaction } from 'yjs';
import type { LexicalEditor } from 'lexical';

import { config } from '#config';
import { resolveCollabServerOrigin } from '#platform/net/origins';
import { requestPersistence } from '#collaboration/persistence-barrier';
import { CollabSession } from '#collaboration/session';
import { editorConfig } from '#client/editor/runtime/config';

type SharedRootObserver = (
  events: Parameters<typeof syncYjsChangesToLexicalV2__EXPERIMENTAL>[2],
  transaction: Transaction,
) => void;

interface SharedRoot {
  observeDeep: (callback: SharedRootObserver) => void;
  unobserveDeep: (callback: SharedRootObserver) => void;
}

function createHeadlessProviderFactory(authorization: string | undefined) {
  const headers = authorization
    ? { Authorization: authorization }
    : { 'X-Remdo-Collaboration-Secret': config.env.COLLAB_INTERNAL_SECRET };
  class HeadlessWebSocket extends WebSocket {
    constructor(url: string | URL) {
      super(url, { headers });
    }
  }
  return createProviderFactory({
    visibleOrigin: resolveCollabServerOrigin(),
    WebSocketPolyfill: HeadlessWebSocket as unknown as typeof globalThis.WebSocket,
  });
}

// Lexical draws each peer's cursor into the editor's DOM after syncing, which a
// headless editor lacks, so it syncs as though no peer were present.
function withoutPeerCursors(provider: Provider): Provider {
  const { awareness } = provider;
  return {
    awareness: {
      getLocalState: awareness.getLocalState.bind(awareness),
      getStates: () => new Map(),
      off: awareness.off.bind(awareness),
      on: awareness.on.bind(awareness),
      setLocalState: awareness.setLocalState.bind(awareness),
      setLocalStateField: awareness.setLocalStateField.bind(awareness),
    },
    connect: provider.connect.bind(provider),
    disconnect: provider.disconnect.bind(provider),
    off: provider.off.bind(provider),
    on: provider.on.bind(provider),
  };
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

interface HeadlessEditorOptions {
  /** A delegated `Bearer` credential; operator tools omit it. */
  authorization?: string;
  /** Keep editor changes local instead of syncing them to the document. */
  readOnly?: boolean;
  /** Cancel opening the document; the signal does not cancel work once `run` starts. */
  signal?: AbortSignal;
}

/**
 * Attach a headless Lexical editor to a collab document and run `run(editor)`
 * once the initial Yjs state has synced into the editor. It resolves only after
 * any write `run` made is durable.
 *
 * If `run` mutates the editor (e.g. `setEditorState`), it should await that
 * update's flush (see `waitForEditorUpdate`) before returning.
 */
export async function withHeadlessEditor<T>(
  docId: string,
  run: (editor: LexicalEditor) => Promise<T> | T,
  { authorization, readOnly = false, signal }: HeadlessEditorOptions = {},
): Promise<T> {
  signal?.throwIfAborted();
  const docMap = new Map<string, Doc>();
  const session = new CollabSession({
    enabled: true,
    docId,
    origin: resolveCollabServerOrigin(),
    providerFactory: createHeadlessProviderFactory(authorization),
  });
  session.attach(docMap);
  const provider = session.getProvider();
  const syncDoc = docMap.get(docId);
  if (!(provider instanceof HocuspocusProvider) || !syncDoc) {
    session.destroy();
    throw new Error('Collaboration provider unavailable');
  }
  const editor = createEditor(editorConfig);
  const binding = createBindingV2__EXPERIMENTAL(editor, docId, syncDoc, docMap);
  const syncProvider = withoutPeerCursors(provider);
  const sharedRoot = binding.root as SharedRoot;
  const observer: SharedRootObserver = (events, transaction) => {
    if (transaction.origin === binding) {
      return;
    }
    syncYjsChangesToLexicalV2__EXPERIMENTAL(
      binding,
      syncProvider,
      events,
      transaction,
      transaction.origin instanceof UndoManager,
    );
  };
  sharedRoot.observeDeep(observer);
  const removeUpdateListener = readOnly ? () => {} : editor.registerUpdateListener((payload) => {
    const { prevEditorState, editorState, dirtyElements, dirtyLeaves, normalizedNodes, tags } = payload;
    syncLexicalUpdateToYjsV2__EXPERIMENTAL(
      binding,
      syncProvider,
      prevEditorState,
      editorState,
      dirtyElements,
      dirtyLeaves,
      normalizedNodes,
      tags,
    );
  });

  let wrote = false as boolean;
  const recordWrite = (_update: Uint8Array, origin: unknown) => {
    if (origin === binding) wrote = true;
  };

  let result: T;
  try {
    void provider.connect();
    await session.awaitSynced(signal);
    const initialUpdate = waitForEditorUpdate(editor);
    syncYjsStateToLexicalV2__EXPERIMENTAL(binding, syncProvider);
    await initialUpdate;
    signal?.throwIfAborted();

    syncDoc.on('update', recordWrite);
    result = await run(editor);
    await session.awaitSynced();
    if (wrote) await requestPersistence(provider);
  } catch (error) {
    if (!wrote) throw error;
    const reason = error instanceof Error ? error.message : 'The operation failed.';
    throw new Error(
      'Document changes are unconfirmed and may still be saved. '
      + `Check the document before retrying to avoid duplicate changes. ${reason}`,
      { cause: error },
    );
  } finally {
    syncDoc.off('update', recordWrite);
    sharedRoot.unobserveDeep(observer);
    removeUpdateListener();
    session.destroy();
    for (const doc of docMap.values()) {
      doc.destroy();
    }
  }

  return result;
}
