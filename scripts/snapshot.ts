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
import { $convertToMarkdownString, TRANSFORMERS } from '@lexical/markdown';

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

interface ParsedArgs {
  command: string | undefined;
  filePath: string;
  markdownPath: string | null;
  docId: string;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let command: string | undefined;
  let filePath: string | undefined;
  let markdownPath: string | null = null;
  let docId: string = serverEnv.COLLAB_DOCUMENT_ID ?? DEFAULT_DOC_ID;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;

    if (arg === '--md') {
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        markdownPath = next;
        i += 1;
      } else {
        markdownPath = '';
      }
      continue;
    }

    if (arg.startsWith('--md=')) {
      markdownPath = arg.slice(5);
      continue;
    }

    if (arg === '--doc') {
      const next = args[i + 1];
      if (!next) {
        throw new Error('Missing value for --doc');
      }
      docId = next.trim();
      i += 1;
      continue;
    }

    if (!command) {
      command = arg;
    } else if (!filePath) {
      filePath = arg;
    }
  }

  const defaultFile = path.join('data', `${docId}.json`);
  return { command, filePath: filePath ?? defaultFile, markdownPath, docId };
}

async function main(): Promise<void> {
  const { command, filePath, markdownPath, docId } = parseArgs();

  if (command === 'save') {
    await runSave(filePath, markdownPath, docId);
  } else if (command === 'load') {
    await runLoad(filePath, docId);
  } else {
    throw new Error('Usage: snapshot.ts [--doc <id>] <load|save> [filePath] [--md[=<file>]]');
  }
}

async function runSave(filePath: string, markdownPath: string | null, docId: string): Promise<void> {
  await withSession(docId, async (editor) => {
    const editorState = editor.getEditorState().toJSON();
    writeJson(filePath, { editorState });

    if (markdownPath !== null) {
      const inferredPath = (() => {
        if (markdownPath && markdownPath.length > 0) return markdownPath;
        const base = filePath.endsWith('.json') ? filePath.slice(0, -5) : filePath;
        return `${base}.md`;
      })();
      const absoluteMarkdownPath = path.isAbsolute(inferredPath)
        ? inferredPath
        : path.resolve(inferredPath);
      const markdown = editor.getEditorState().read(() => $convertToMarkdownString(TRANSFORMERS));
      fs.mkdirSync(path.dirname(absoluteMarkdownPath), { recursive: true });
      fs.writeFileSync(absoluteMarkdownPath, `${markdown}\n`);
    }
  });
}

async function runLoad(filePath: string, docId: string): Promise<void> {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
    editorState?: SerializedEditorState<SerializedLexicalNode>;
  };
  await withSession(docId, async (editor) => {
    const done = waitForEditorUpdate(editor);
    editor.setEditorState(editor.parseEditorState(data.editorState ?? editor.getEditorState().toJSON()), { tag: 'snapshot-load' });
    await done;
  });
}

async function withSession(docId: string, run: (editor: LexicalEditor) => Promise<void> | void): Promise<void> {
  const doc = new Doc();
  const docMap = new Map([[docId, doc]]);
  const syncController = new CollaborationSyncController(() => {});
  syncController.setSyncing(true);
  const providerFactory = createProviderFactory(
    {
      setReady: () => {},
      syncController,
    },
    ENDPOINT,
  );
  const lexicalProvider = providerFactory(docId, docMap);
  const provider = lexicalProvider as unknown as Provider & {
    connect: () => void;
    destroy: () => void;
    synced: boolean;
    on: (event: string, handler: (payload: unknown) => void) => void;
    off: (event: string, handler: (payload: unknown) => void) => void;
  };
  (provider as unknown as { _WS?: typeof globalThis.WebSocket })._WS = WebSocket as unknown as typeof globalThis.WebSocket;
  const syncDoc = docMap.get(docId);
  if (!syncDoc) {
    throw new Error('Failed to resolve collaboration document.');
  }
  const editor = createEditor(
    createEditorInitialConfig({ isDev: serverRuntime.isDev }) as CreateEditorArgs
  );
  const binding = createBindingV2__EXPERIMENTAL(editor, docId, doc, docMap);
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
