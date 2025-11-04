#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  createBindingV2__EXPERIMENTAL,
  syncLexicalUpdateToYjsV2__EXPERIMENTAL,
  syncYjsChangesToLexicalV2__EXPERIMENTAL,
  syncYjsStateToLexicalV2__EXPERIMENTAL,
} from '@lexical/yjs';
import type { Provider } from '@lexical/yjs';
import { createEditor } from 'lexical';
import type { CreateEditorArgs, LexicalEditor, SerializedEditorState, SerializedLexicalNode } from 'lexical';
import { Doc, UndoManager } from 'yjs';
import type { Transaction } from 'yjs';
import WebSocket from 'ws';

import { env as serverEnv, runtime as serverRuntime } from '../config/server';
import { DEFAULT_DOC_ID } from '../config/spec';
import { createEditorInitialConfig } from '../lib/editor/config';
import {
  CollaborationSyncController,
  createProviderFactory,
} from '../src/editor/plugins/collaboration/collaborationRuntime'; // TODO: move provider factory to lib/ for reuse

interface SharedRootObserver {
  (events: unknown, transaction: Transaction): void;
}

interface SharedRoot {
  observeDeep: (callback: SharedRootObserver) => void;
  unobserveDeep: (callback: SharedRootObserver) => void;
}

const DEFAULT_FILE = path.join('data', `${DEFAULT_DOC_ID}.json`);
const ENDPOINT = `ws://${serverEnv.HOST}:${serverEnv.COLLAB_SERVER_PORT}`;

function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

if (typeof globalThis.document === 'undefined') {
  const createStubElement = (tagName: string) => {
    const element: any = {
      tagName,
      style: {},
      appendChild() {},
      removeChild() {},
      textContent: '',
    };
    return element;
  };

  globalThis.document = {
    createElement: createStubElement,
  } as unknown as Document;
}

async function main(): Promise<void> {
  const [command, filePath = DEFAULT_FILE] = process.argv.slice(2);
  if (command === 'save') {
    await runSave(filePath);
  } else if (command === 'load') {
    await runLoad(filePath);
  } else {
    throw new Error('Usage: snapshot.ts <load|save> [filePath]');
  }
}

async function runSave(filePath: string): Promise<void> {
  await withSession(async (editor) => {
    const editorState = editor.getEditorState().toJSON();
    writeJson(filePath, { editorState });
  });
}

async function runLoad(filePath: string): Promise<void> {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
    editorState?: SerializedEditorState<SerializedLexicalNode>;
  };
  await withSession(async (editor) => {
    const done = waitForEditorUpdate(editor);
    editor.setEditorState(editor.parseEditorState(data.editorState ?? editor.getEditorState().toJSON()), { tag: 'snapshot-load' });
    await done;
  });
}

async function withSession(run: (editor: LexicalEditor) => Promise<void> | void): Promise<void> {
  const doc = new Doc();
  const docMap = new Map([[DEFAULT_DOC_ID, doc]]);
  const syncController = new CollaborationSyncController(() => {});
  syncController.setSyncing(true);
  const providerFactory = createProviderFactory(
    {
      setReady: () => {},
      syncController,
    },
    ENDPOINT,
  );
  const lexicalProvider = providerFactory(DEFAULT_DOC_ID, docMap);
  const provider = lexicalProvider as unknown as Provider & {
    connect: () => void;
    destroy: () => void;
    synced: boolean;
    on: (event: string, handler: (payload: unknown) => void) => void;
    off: (event: string, handler: (payload: unknown) => void) => void;
  };
  (provider as unknown as { _WS?: typeof globalThis.WebSocket })._WS = WebSocket as unknown as typeof globalThis.WebSocket;
  const syncDoc = docMap.get(DEFAULT_DOC_ID);
  if (!syncDoc) {
    throw new Error('Failed to resolve collaboration document.');
  }
  const editor = createEditor(
    createEditorInitialConfig({ isDev: serverRuntime.isDev }) as CreateEditorArgs
  );
  const binding = createBindingV2__EXPERIMENTAL(editor, DEFAULT_DOC_ID, doc, docMap);
  const sharedRoot = binding.root as unknown as SharedRoot;
  const observer: SharedRootObserver = (events, transaction) => {
    if (transaction.origin === binding) {
      return;
    }
    syncYjsChangesToLexicalV2__EXPERIMENTAL(
      binding,
      lexicalProvider,
      events as unknown as Parameters<typeof syncYjsChangesToLexicalV2__EXPERIMENTAL>[2],
      transaction,
      transaction.origin instanceof UndoManager
    );
  };
  sharedRoot.observeDeep(observer);
  const removeUpdateListener = editor.registerUpdateListener((payload) => {
    const { prevEditorState, editorState, dirtyElements, normalizedNodes, tags } = payload;
    syncLexicalUpdateToYjsV2__EXPERIMENTAL(
      binding,
      lexicalProvider,
      prevEditorState,
      editorState,
      dirtyElements,
      normalizedNodes,
      tags,
    );
  });

  const initialUpdate = waitForEditorUpdate(editor);
  void provider.connect();
  await waitForSync(provider);
  syncYjsStateToLexicalV2__EXPERIMENTAL(binding, lexicalProvider);
  await initialUpdate;

  try {
    return await run(editor);
  } finally {
    sharedRoot.unobserveDeep(observer);
    removeUpdateListener();
    provider.destroy();
    doc.destroy();
  }
}

function waitForEditorUpdate(editor: LexicalEditor): Promise<void> {
  return new Promise((resolve) => {
    const unregister = editor.registerUpdateListener(() => {
      unregister();
      resolve();
    });
  });
}

function waitForSync(provider: Provider & { synced: boolean; on: (event: string, handler: (payload: unknown) => void) => void; off: (event: string, handler: (payload: unknown) => void) => void; }): Promise<void> {
  if (provider.synced) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const handleSync = (isSynced: boolean) => {
      if (isSynced) {
        provider.off('sync', handleSync);
        resolve();
      }
    };
    provider.on('sync', handleSync);
  });
}
