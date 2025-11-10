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
import { $getRoot, createEditor } from 'lexical';
import WebSocket from 'ws';
import { Doc, UndoManager } from 'yjs';

import type { Provider } from '@lexical/yjs';
import type { CreateEditorArgs, LexicalEditor, SerializedEditorState, SerializedLexicalNode } from 'lexical';
import type { Transaction } from 'yjs';

import { config } from '#config';
import { createEditorInitialConfig } from '#lib/editor/config';
import { CollaborationSyncController, createProviderFactory } from '#lib/collaboration/runtime';

interface SharedRootObserver {
  (events: unknown, transaction: Transaction): void;
}

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
  waitForIdle: (timeoutMs?: number) => Promise<void>;
  resetDocument: () => Promise<void>;
}

// eslint-disable-next-line node/no-process-env
const snapshotDebugDir = process.env.SNAPSHOT_DEBUG_DIR;

function captureDebugState(
  docId: string,
  phase: 'load' | 'save' | 'verify',
  editorState: SerializedEditorState<SerializedLexicalNode>,
  metadata: Record<string, unknown> = {}
): void {
  if (!snapshotDebugDir) {
    return;
  }

  const debugPath = path.resolve(snapshotDebugDir, `${docId}.${phase}.json`);
  const payload = {
    timestamp: new Date().toISOString(),
    docId,
    phase,
    ...metadata,
    editorState,
  } satisfies Record<string, unknown>;

  fs.mkdirSync(path.dirname(debugPath), { recursive: true });
  fs.writeFileSync(debugPath, `${JSON.stringify(payload, null, 2)}\n`);
  const getChildren = (node: unknown): SerializedLexicalNode[] =>
    node && typeof node === 'object' && Array.isArray((node as { children?: SerializedLexicalNode[] }).children)
      ? ((node as { children?: SerializedLexicalNode[] }).children ?? [])
      : [];
  const rootChildren = getChildren(editorState.root);
  const firstChildChildren = getChildren(rootChildren[0]).length;
  console.info(
    `[snapshot-debug] captured ${phase} state for doc ${docId} -> ${debugPath} (rootChildren=${rootChildren.length}, firstChildChildren=${firstChildChildren})`
  );
}

const SYNC_IDLE_TIMEOUT_MS = 10_000;

function createSyncTracker() {
  let syncing = true;
  let waiters: Array<{ resolve: () => void; timeoutId: NodeJS.Timeout }> = [];

  const setSyncing = (value: boolean) => {
    syncing = value;
    if (!syncing) {
      const listeners = waiters;
      waiters = [];
      for (const entry of listeners) {
        clearTimeout(entry.timeoutId);
        entry.resolve();
      }
    }
  };

  const waitForIdle = (timeoutMs = SYNC_IDLE_TIMEOUT_MS): Promise<void> => {
    if (!syncing) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      let timeoutId: NodeJS.Timeout;
      const resolveFn = () => {
        clearTimeout(timeoutId);
        waiters = waiters.filter((entry) => entry.resolve !== resolveFn);
        resolve();
      };
      timeoutId = setTimeout(() => {
        waiters = waiters.filter((entry) => entry.resolve !== resolveFn);
        reject(new Error('Timed out waiting for collaboration sync to become idle.'));
      }, timeoutMs);
      waiters.push({ resolve: resolveFn, timeoutId });
    });
  };

  return { setSyncing, waitForIdle };
}

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
  await withSession(docId, endpoint, async (editor, { waitForIdle }) => {
    const editorState = editor.getEditorState().toJSON();
    writeJson(filePath, { editorState });
    captureDebugState(docId, 'save', editorState, { target: filePath });

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

    await waitForIdle();
  });
}

async function runLoad(docId: string, endpoint: string, filePath: string): Promise<void> {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
    editorState?: SerializedEditorState<SerializedLexicalNode>;
  };
  const targetState = data.editorState ?? null;
  const appliedState = await withSession(docId, endpoint, async (editor, { provider, waitForIdle, resetDocument }) => {
    await resetDocument();
    const done = waitForEditorUpdate(editor);
    editor.setEditorState(editor.parseEditorState(data.editorState ?? editor.getEditorState().toJSON()), { tag: 'snapshot-load' });
    await done;
    await waitForIdle();
    if (!provider.synced) {
      await waitForSync(provider);
    }
    return editor.getEditorState().toJSON();
  });
  captureDebugState(docId, 'load', appliedState, { source: filePath });
  await verifyRemoteState(docId, endpoint, targetState ?? appliedState);
}

async function verifyRemoteState(
  docId: string,
  endpoint: string,
  expectedState: SerializedEditorState<SerializedLexicalNode>
): Promise<void> {
  const verifyDir = path.resolve('data', '.snapshot.verify');
  fs.mkdirSync(verifyDir, { recursive: true });
  const verifyPath = path.join(verifyDir, `${docId}.${Date.now()}.json`);
  await runSave(docId, endpoint, verifyPath, null);
  const remote = JSON.parse(fs.readFileSync(verifyPath, 'utf8')) as {
    editorState?: SerializedEditorState<SerializedLexicalNode>;
  };
  fs.rmSync(verifyPath, { force: true });
  const remoteState = remote.editorState ?? null;
  if (remoteState) {
    captureDebugState(docId, 'verify', remoteState, { target: verifyPath });
  }
  const expectedRoot = JSON.stringify(expectedState.root ?? null);
  const remoteRoot = JSON.stringify(remoteState?.root ?? null);
  if (remoteRoot !== expectedRoot) {
    console.error('[snapshot-debug] remote state mismatch', {
      docId,
      expectedRoot,
      remoteRoot,
    });
    throw new Error(`Collaborative document ${docId} did not reach expected state after snapshot load.`);
  }
}

async function withSession<T>(
  docId: string,
  endpoint: string,
  run: (editor: LexicalEditor, context: SessionContext) => Promise<T> | T
): Promise<T> {
  const doc = new Doc();
  const docMap = new Map([[docId, doc]]);
  const syncTracker = createSyncTracker();
  const syncController = new CollaborationSyncController(syncTracker.setSyncing);
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
  await syncTracker.waitForIdle();

  const resetDocument = async () => {
    const shared = binding.root as unknown as { delete: (index: number, length: number) => void; length: number };
    shared.delete(0, shared.length);
    const cleared = waitForEditorUpdate(editor);
    editor.update(() => {
      $getRoot().clear();
    });
    await cleared;
    await syncTracker.waitForIdle();
    if (!provider.synced) {
      await waitForSync(provider);
    }
  };

  try {
    return await run(editor, { provider, waitForIdle: syncTracker.waitForIdle, resetDocument });
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
