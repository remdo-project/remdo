#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { $convertToMarkdownString, TRANSFORMERS } from '@lexical/markdown';
import {
  createBindingV2__EXPERIMENTAL,
  syncLexicalUpdateToYjsV2__EXPERIMENTAL,
  syncYjsChangesToLexicalV2__EXPERIMENTAL,
  syncYjsStateToLexicalV2__EXPERIMENTAL,
} from '@lexical/yjs';
import { createEditor } from 'lexical';
import WebSocket from 'ws';
import { Doc, UndoManager } from 'yjs';

import type { Provider } from '@lexical/yjs';
import type { CreateEditorArgs, LexicalEditor, SerializedEditorState } from 'lexical';
import type { Transaction } from 'yjs';

import { config } from '#config';
import { createEditorInitialConfig } from '#lib/editor/config';
import { CollaborationSyncController, createProviderFactory } from '#lib/collaboration/runtime';

type SharedRootObserver = (
  events: Parameters<typeof syncYjsChangesToLexicalV2__EXPERIMENTAL>[2],
  transaction: Transaction,
) => void;

interface SharedRoot {
  observeDeep: (callback: SharedRootObserver) => void;
  unobserveDeep: (callback: SharedRootObserver) => void;
}

interface CliArguments {
  command?: string;
  filePath?: string;
  docId?: string;
  markdownPath: string | null;
}

type SnapshotProvider = Provider & {
  connect: () => void;
  destroy: () => void;
  synced: boolean;
  on: (event: string, handler: (payload: unknown) => void) => void;
  off: (event: string, handler: (payload: unknown) => void) => void;
};

interface SessionContext {
  provider: SnapshotProvider;
}

const COLLAB_SYNC_TIMEOUT_MS = 10_000;

function parseCliArguments(argv: string[]): CliArguments {
  const result: CliArguments = { markdownPath: null };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;

    if (arg === '--doc' || arg.startsWith('--doc=')) {
      const value = arg === '--doc' ? argv[i + 1] : arg.slice(6);
      if (!value || (arg === '--doc' && value.startsWith('--'))) {
        throw new Error('Missing value for --doc');
      }
      result.docId = value;
      if (arg === '--doc') {
        i += 1;
      }
      continue;
    }

    if (arg === '--md') {
      const next = argv[i + 1];
      const hasValue = next && !next.startsWith('--');
      result.markdownPath = hasValue ? next : '';
      if (hasValue) {
        i += 1;
      }
      continue;
    }

    if (arg.startsWith('--md=')) {
      result.markdownPath = arg.slice(5);
      continue;
    }

    if (!result.command) {
      result.command = arg;
    } else if (!result.filePath) {
      result.filePath = arg;
    }
  }

  return result;
}

function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

if (globalThis.document === undefined) {
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
  const { command, filePath, docId: cliDocId, markdownPath } = parseCliArguments(process.argv.slice(2));
  if (command !== 'save' && command !== 'load') {
    throw new Error('Usage: snapshot.ts [--doc <id>] <load|save> [filePath] [--md[=<file>]]');
  }

  const docId = cliDocId?.trim() || config.env.COLLAB_DOCUMENT_ID;
  const targetFile = resolveSnapshotPath(command, docId, filePath);
  const endpoint = `ws://${config.env.HOST}:${config.env.COLLAB_SERVER_PORT}`;

  return command === 'save'
    ? runSave(docId, endpoint, targetFile, markdownPath)
    : runLoad(docId, endpoint, targetFile);
}

function resolveSnapshotPath(
  command: NonNullable<CliArguments['command']>,
  docId: string,
  filePath: CliArguments['filePath'],
): string {
  if (!filePath) {
    return path.join('data', `${docId}.json`);
  }

  const absolutePath = path.resolve(filePath);
  if (command === 'load' && !fs.existsSync(absolutePath)) {
    const fixturesRoot = path.resolve('tests', 'fixtures');
    const normalizeToPosix = (target: string) =>
      path.posix.normalize(target.split(path.win32.sep).join(path.posix.sep));
    const ensureJsonExtension = (target: string) =>
      target.endsWith('.json') ? target : `${target}.json`;
    const fixturePrefix = 'tests/fixtures/';
    const ensureFixturePrefix = (target: string) =>
      target.startsWith(fixturePrefix) ? target : `${fixturePrefix}${target}`;
    const normalizedInput = normalizeToPosix(filePath);
    const candidateInputs = new Set<string>();

    const addCandidate = (candidate: string) => {
      if (!candidate) {
        return;
      }
      candidateInputs.add(candidate);
      candidateInputs.add(ensureJsonExtension(candidate));
    };

    const sanitizedInput = normalizedInput.replace(/^(?:\.\/)+/, '');
    if (sanitizedInput.length > 0 && !sanitizedInput.startsWith('../')) {
      addCandidate(sanitizedInput);
      addCandidate(ensureFixturePrefix(sanitizedInput));
    }

    if (!normalizedInput.startsWith('../')) {
      addCandidate(normalizedInput);
      addCandidate(ensureFixturePrefix(normalizedInput));
    }

    const baseName = ensureJsonExtension(path.posix.basename(normalizedInput));
    addCandidate(ensureFixturePrefix(baseName));

    for (const candidate of candidateInputs) {
      const directPath = path.resolve(candidate);
      if (fs.existsSync(directPath)) {
        return directPath;
      }
      const fixturePath = path.resolve(fixturesRoot, candidate);
      if (fs.existsSync(fixturePath)) {
        return fixturePath;
      }
    }
  }

  return absolutePath;
}

async function runSave(
  docId: string,
  endpoint: string,
  filePath: string,
  markdownPath: string | null
): Promise<void> {
  await withSession(docId, endpoint, async (editor) => {
    const editorState = editor.getEditorState().toJSON();
    writeJson(filePath, { editorState });

    if (markdownPath !== null) {
      const inferredPath = (() => {
        if (markdownPath && markdownPath.length > 0) {
          return markdownPath;
        }
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

async function runLoad(docId: string, endpoint: string, filePath: string): Promise<void> {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
    editorState?: SerializedEditorState;
  };
  await withSession(docId, endpoint, async (editor, { provider }) => {
    const done = waitForEditorUpdate(editor);
    editor.setEditorState(editor.parseEditorState(data.editorState ?? editor.getEditorState().toJSON()), { tag: 'snapshot-load' });
    await done;
    if (!provider.synced) {
      await waitForSync(provider);
    }
  });
}

async function withSession(
  docId: string,
  endpoint: string,
  run: (editor: LexicalEditor, context: SessionContext) => Promise<void> | void
): Promise<void> {
  const doc = new Doc();
  const docMap = new Map([[docId, doc]]);
  const syncController = new CollaborationSyncController(() => {});
  syncController.setSyncing(true);
  const providerFactory = createProviderFactory(
    {
      setReady: () => {},
      syncController,
    },
    endpoint,
  );
  const lexicalProvider = providerFactory(docId, docMap);
  const provider = lexicalProvider as unknown as SnapshotProvider;
  (provider as unknown as { _WS?: typeof globalThis.WebSocket })._WS = WebSocket as unknown as typeof globalThis.WebSocket;
  const syncDoc = docMap.get(docId);
  if (!syncDoc) {
    throw new Error('Failed to resolve collaboration document.');
  }
  const editor = createEditor(
    createEditorInitialConfig({ isDev: config.dev }) as CreateEditorArgs
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
      events,
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

  try {
    const initialUpdate = waitForEditorUpdate(editor);
    void provider.connect();
    await waitForSync(provider);
    syncYjsStateToLexicalV2__EXPERIMENTAL(binding, lexicalProvider);
    await initialUpdate;

    return await run(editor, { provider });
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
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let cleanup = () => {};

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      callback();
    };

    const handleSync = (isSynced: boolean) => {
      if (isSynced) {
        finish(() => {
          resolve();
        });
      }
    };

    const handleFailure = (payload: unknown) => {
      finish(() => {
        const error = payload instanceof Error ? payload : createConnectionError(payload);
        reject(error);
      });
    };

    cleanup = () => {
      provider.off('sync', handleSync);
      provider.off('connection-close', handleFailure);
      provider.off('connection-error', handleFailure);
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    };

    timeout = setTimeout(() => {
      finish(() => {
        reject(new Error(`Timed out waiting for collaboration sync after ${COLLAB_SYNC_TIMEOUT_MS}ms`));
      });
    }, COLLAB_SYNC_TIMEOUT_MS);

    provider.on('sync', handleSync);
    provider.on('connection-close', handleFailure);
    provider.on('connection-error', handleFailure);
  });
}

function createConnectionError(payload: unknown): Error {
  if (payload && typeof payload === 'object') {
    const maybeReason = (payload as { reason?: unknown }).reason;
    if (typeof maybeReason === 'string' && maybeReason.length > 0) {
      return new Error(`Failed to connect to collaboration server: ${maybeReason}`);
    }
  }
  return new Error('Failed to connect to collaboration server');
}
