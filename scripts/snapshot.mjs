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
const { DEFAULT_DOC_ID } = jiti('../config/collab.constants.ts');

const DEFAULT_FILE = path.join('data', `${DEFAULT_DOC_ID}.json`);
const ENDPOINT = `ws://${env.HOST}:${env.COLLAB_SERVER_PORT}`;

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function main() {
  const [command, filePath = DEFAULT_FILE] = process.argv.slice(2);
  if (command === 'save') {
    await runSave(filePath);
  } else if (command === 'load') {
    await runLoad(filePath);
  } else {
    throw new Error('Usage: snapshot.mjs <load|save> [filePath]');
  }
}

async function runSave(filePath) {
  await withSession(async (editor) => {
    const editorState = editor.getEditorState().toJSON();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const existing = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : {};
    fs.writeFileSync(filePath, `${JSON.stringify({ ...existing, editorState }, null, 2)}\n`);
  });
}

async function runLoad(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  await withSession(async (editor) => {
    const done = waitForEditorUpdate(editor);
    editor.setEditorState(editor.parseEditorState(data.editorState), { tag: 'snapshot-load' });
    await done;
  });
}

async function withSession(run) {
  const doc = new Doc();
  const provider = new WebsocketProvider(ENDPOINT, DEFAULT_DOC_ID, doc, {
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
  const binding = createBinding(editor, provider, DEFAULT_DOC_ID, doc, new Map([[DEFAULT_DOC_ID, doc]]));
  const sharedRoot = binding.root.getSharedType();
  const observer = (events, transaction) => {
    if (transaction.origin === binding) {
      return;
    }
    syncYjsChangesToLexical(binding, provider, events, transaction.origin instanceof UndoManager);
  };
  sharedRoot.observeDeep(observer);
  const removeUpdateListener = editor.registerUpdateListener((payload) => {
    const { prevEditorState, editorState, dirtyElements, dirtyLeaves, normalizedNodes, tags } = payload;
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
  });

  const initialUpdate = waitForEditorUpdate(editor);
  provider.connect();
  await waitForSync(provider);
  await initialUpdate;

  try {
    return await run(editor);
  } finally {
    sharedRoot.unobserveDeep(observer);
    removeUpdateListener();
    provider.destroy();
    binding.root.destroy(binding);
    doc.destroy();
  }
}

function waitForEditorUpdate(editor) {
  return new Promise((resolve) => {
    const unregister = editor.registerUpdateListener(() => {
      unregister();
      resolve();
    });
  });
}

function waitForSync(provider) {
  if (provider.synced) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const handleSync = (isSynced) => {
      if (isSynced) {
        provider.off('sync', handleSync);
        resolve();
      }
    };
    provider.on('sync', handleSync);
  });
}
