#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';

import { ListItemNode, ListNode } from '@lexical/list';
import { createBinding, syncLexicalUpdateToYjs, syncYjsChangesToLexical } from '@lexical/yjs';
import { WebsocketProvider } from 'y-websocket';
import { createEditor } from 'lexical';
import { Doc, UndoManager } from 'yjs';
import WebSocket from 'ws';

const require = createRequire(import.meta.url);
const jiti = require('jiti')(import.meta.url);
const { env } = jiti('../config/env.server.ts');

const DOC_ID = 'main';
const DEFAULT_FILE = path.join('data', `${DOC_ID}.json`);
const ENDPOINT = `ws://${env.HOST}:${env.COLLAB_SERVER_PORT}`;
const SYNC_TIMEOUT = 10000;

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function main() {
  const [command, fileArg, ...rest] = process.argv.slice(2);
  if (!command || rest.length > 0 || (command !== 'load' && command !== 'save')) {
    throw new Error('Usage: snapshot.mjs <load|save> [filePath]');
  }
  const filePath = fileArg ?? DEFAULT_FILE;
  if (command === 'save') {
    await runSave(filePath);
  } else {
    await runLoad(filePath);
  }
}

async function runSave(filePath) {
  const session = await createSession();
  try {
    const json = session.editor.getEditorState().toJSON();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`);
  } finally {
    session.cleanup();
  }
}

async function runLoad(filePath) {
  const session = await createSession();
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const state = session.editor.parseEditorState(parsed);
    await applyEditorState(session.editor, state);
  } finally {
    session.cleanup();
  }
}

async function createSession() {
  const doc = new Doc();
  const docMap = new Map([[DOC_ID, doc]]);
  const provider = new WebsocketProvider(ENDPOINT, DOC_ID, doc, {
    connect: false,
    WebSocketPolyfill: WebSocket,
  });
  const editor = createEditor({
    namespace: 'remdo-snapshot',
    nodes: [ListNode, ListItemNode],
    onError(error) {
      throw error;
    },
  });
  const binding = createBinding(editor, provider, DOC_ID, doc, docMap);
  const sharedRoot = binding.root.getSharedType();
  const observer = (events, transaction) => {
    if (transaction.origin === binding) {
      return;
    }
    const isUndo = transaction.origin instanceof UndoManager;
    syncYjsChangesToLexical(binding, provider, events, isUndo);
  };
  sharedRoot.observeDeep(observer);
  const removeUpdateListener = editor.registerUpdateListener(
    ({
      prevEditorState,
      editorState,
      dirtyElements,
      dirtyLeaves,
      normalizedNodes,
      tags,
    }) => {
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
  try {
    const initialUpdate = waitForNextEditorUpdate(editor);
    provider.connect();
    await waitForProviderSync(provider);
    await initialUpdate;
  } catch (error) {
    sharedRoot.unobserveDeep(observer);
    removeUpdateListener();
    provider.destroy();
    binding.root.destroy(binding);
    doc.destroy();
    throw error;
  }
  return {
    editor,
    cleanup() {
      sharedRoot.unobserveDeep(observer);
      removeUpdateListener();
      provider.destroy();
      binding.root.destroy(binding);
      doc.destroy();
    },
  };
}

function waitForNextEditorUpdate(editor) {
  return new Promise((resolve) => {
    let resolved = false;
    let timer;
    let unregister = () => {};
    const finish = () => {
      if (resolved) {
        return;
      }
      resolved = true;
      clearTimeout(timer);
      unregister();
      resolve();
    };
    unregister = editor.registerUpdateListener(finish);
    timer = setTimeout(finish, 1000);
  });
}

function waitForProviderSync(provider) {
  if (provider.synced) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => {
      provider.off('sync', onSync);
      provider.off('connection-close', onClose);
      provider.off('connection-error', onClose);
      clearTimeout(timer);
    };
    function onSync(isSynced) {
      if (!isSynced) {
        return;
      }
      cleanup();
      resolve();
    }
    function onClose() {
      cleanup();
      reject(new Error('Failed to connect to collaboration server'));
    }
    timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for collaboration sync'));
    }, SYNC_TIMEOUT);
    provider.on('sync', onSync);
    provider.on('connection-close', onClose);
    provider.on('connection-error', onClose);
  });
}

async function applyEditorState(editor, state) {
  const updatePromise = waitForNextEditorUpdate(editor);
  editor.setEditorState(state, { tag: 'snapshot-load' });
  await updatePromise;
}
