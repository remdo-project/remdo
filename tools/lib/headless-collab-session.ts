import path from 'node:path';
import fs from 'node:fs';

import { createYjsProvider } from '@y-sweet/client';
import {
  createBindingV2__EXPERIMENTAL,
  syncLexicalUpdateToYjsV2__EXPERIMENTAL,
  syncYjsChangesToLexicalV2__EXPERIMENTAL,
  syncYjsStateToLexicalV2__EXPERIMENTAL,
} from '@lexical/yjs';
import { createEditor } from 'lexical';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { UndoManager } from 'yjs';
import type { Doc, Transaction } from 'yjs';
import type { Provider } from '@lexical/yjs';
import type { CreateEditorArgs, LexicalEditor } from 'lexical';

import { config } from '#config';
import { resolveApiServerOrigin, resolveCollabServerOrigin } from '#platform/net/origins';
import { CollabSession } from '#collaboration/session';
import { waitForSessionAttachment } from '#collaboration/wait-for-session-attachment';
import { createYSweetDocumentTokenManager } from '#server/collab-token';
import type { CollaborationSessionProvider } from '#collaboration/runtime';
import { createEditorInitialConfig } from '#client/editor/runtime/config';

type SharedRootObserver = (
  events: Parameters<typeof syncYjsChangesToLexicalV2__EXPERIMENTAL>[2],
  transaction: Transaction,
) => void;

interface SharedRoot {
  observeDeep: (callback: SharedRootObserver) => void;
  unobserveDeep: (callback: SharedRootObserver) => void;
}

type ConnectableProvider = Provider & { connect: () => void; destroy: () => void };
type ConnectableProviderWithWebSocket = ConnectableProvider & { _WS?: typeof globalThis.WebSocket };

function createInternalProviderFactory() {
  const manager = createYSweetDocumentTokenManager();

  return async (docId: string, docMap: Map<string, Doc>) => {
    let doc = docMap.get(docId);
    if (!doc) {
      doc = new Y.Doc();
      docMap.set(docId, doc);
    }

    doc.get('root', Y.XmlText);

    const token = await manager.getOrCreateDocAndToken(docId, {
      authorization: 'full',
    });
    const provider = createYjsProvider(doc, docId, async () => token, {
      connect: false,
      offlineSupport: false,
      showDebuggerLink: false,
    });
    let destroyed = false;
    const originalDestroy = provider.destroy.bind(provider);

    return {
      doc,
      provider: Object.assign(provider as unknown as Provider, {
        destroy: () => {
          if (destroyed) {
            return;
          }
          destroyed = true;
          provider.connect = () => Promise.resolve();
          provider.disconnect();
          originalDestroy();
        },
      }) as CollaborationSessionProvider,
    };
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

async function waitForPersistedData(docId: string, timeoutMs = 15_000): Promise<void> {
  const target = path.join(config.env.DATA_DIR, 'collab', docId, 'data.ysweet');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(target)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${target}`);
}

/**
 * Attach a headless Lexical editor to a collab document, run `run(editor)` once
 * the initial Yjs state has synced into the editor, then wait for the server to
 * persist. Used to read documents out (snapshot) and to write fixture content in
 * (dev data seeding) without a browser.
 *
 * `run` is invoked with a hydrated editor. If it mutates the editor (e.g.
 * `setEditorState`), it should return a promise that resolves once that update
 * has flushed (see `waitForEditorUpdate`); the session awaits `run`'s result
 * before syncing and persisting, so the write reaches the server.
 */
export async function withHeadlessCollabSession<T>(
  docId: string,
  run: (editor: LexicalEditor) => Promise<T> | T,
): Promise<T> {
  const docMap = new Map<string, Doc>();
  const session = new CollabSession({
    enabled: true,
    docId,
    origin: resolveCollabServerOrigin({ loopback: true }),
    apiOrigin: resolveApiServerOrigin({ loopback: true }),
    providerFactory: createInternalProviderFactory(),
  });
  session.attach(docMap);
  const attached = await waitForSessionAttachment(session, docMap, docId);
  const provider = attached.provider as ConnectableProviderWithWebSocket;
  provider._WS = WebSocket as unknown as typeof globalThis.WebSocket;
  const syncDoc = attached.doc;
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
    const { prevEditorState, editorState, dirtyElements, normalizedNodes, tags } = payload;
    syncLexicalUpdateToYjsV2__EXPERIMENTAL(
      binding,
      provider,
      prevEditorState,
      editorState,
      dirtyElements,
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

    result = await run(editor);
    await session.awaitSynced();
  } finally {
    sharedRoot.unobserveDeep(observer);
    removeUpdateListener();
    session.destroy();
    for (const doc of docMap.values()) {
      doc.destroy();
    }
  }

  await waitForPersistedData(docId);
  return result;
}
