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
import { WebsocketProvider } from 'y-websocket';
import { createEditor } from 'lexical';
import type { CreateEditorArgs, LexicalEditor } from 'lexical';
import { Doc, UndoManager } from 'yjs';
import type { Transaction } from 'yjs';
import WebSocket from 'ws';

import { env as serverEnv, runtime as serverRuntime } from '../config/server';
import { DEFAULT_DOC_ID } from '../config/spec';
import { createEditorInitialConfig } from '../lib/editor/config';

interface SharedRootObserver {
  (events: unknown, transaction: Transaction): void;
}

interface SharedRoot {
  observeDeep: (callback: SharedRootObserver) => void;
  unobserveDeep: (callback: SharedRootObserver) => void;
}

const DEFAULT_FILE = path.join('data', `${DEFAULT_DOC_ID}.json`);
const ENDPOINT = `ws://${serverEnv.HOST}:${serverEnv.COLLAB_SERVER_PORT}`;

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
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const existing = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : {};
    fs.writeFileSync(filePath, `${JSON.stringify({ ...existing, editorState }, null, 2)}\n`);
  });
}

async function runLoad(filePath: string): Promise<void> {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  await withSession(async (editor) => {
    const done = waitForEditorUpdate(editor);
    editor.setEditorState(editor.parseEditorState(data.editorState), { tag: 'snapshot-load' });
    await done;
  });
}

async function withSession(run: (editor: LexicalEditor) => Promise<void> | void): Promise<void> {
  const doc = new Doc();
  doc.getXmlElement('root-v2');
  const provider = new WebsocketProvider(ENDPOINT, DEFAULT_DOC_ID, doc, {
    connect: false,
    WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
  });
  const lexicalProvider = provider as unknown as Provider;
  const editor = createEditor(
    createEditorInitialConfig({ isDev: serverRuntime.isDev }) as CreateEditorArgs
  );
  const docMap = new Map([[DEFAULT_DOC_ID, doc]]);
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
  provider.connect();
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

function waitForSync(provider: WebsocketProvider): Promise<void> {
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
