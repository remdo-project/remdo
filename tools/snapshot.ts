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
import type { Doc, Transaction } from 'yjs';
import { UndoManager } from 'yjs';
import type { Provider } from '@lexical/yjs';
import type { CreateEditorArgs, LexicalEditor, SerializedEditorState } from 'lexical';

import { config } from '#config';
import { CollabSession } from '#lib/collaboration/session';
import { restoreEditorStateDefaults, stripEditorStateDefaults } from '#lib/editor/editor-state-defaults';
import { createEditorInitialConfig } from '#lib/editor/config';
import { $syncInternalNoteLinkNodeUrls } from '#lib/editor/internal-note-link-node';

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
  minify: boolean;
}

type SnapshotProvider = Provider & {
  connect: () => void;
  destroy: () => void;
  on: (event: string, handler: (payload: unknown) => void) => void;
  off: (event: string, handler: (payload: unknown) => void) => void;
};

interface SessionContext {
  provider: SnapshotProvider;
  session: CollabSession;
}

function parseCliArguments(argv: string[]): CliArguments {
  const result: CliArguments = { markdownPath: null, minify: false };

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

    if (arg === '--minify') {
      result.minify = true;
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

type GlobalWithOptionalDocument = Omit<typeof globalThis, 'document'> & { document?: Document };

const globalWithOptionalDocument = globalThis as GlobalWithOptionalDocument;

if (globalWithOptionalDocument.document === undefined) {
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

  globalWithOptionalDocument.document = {
    createElement: createStubElement,
  } as unknown as Document;
}

const { command, filePath, docId: cliDocId, markdownPath, minify } = parseCliArguments(process.argv.slice(2));
if (command !== 'save' && command !== 'load' && command !== 'backup') {
  throw new Error(
    'Usage: snapshot.ts [--doc <id>] <load|save|backup> [filePath] [--minify] [--md[=<file>]]'
  );
}

const docId = cliDocId?.trim() || config.env.COLLAB_DOCUMENT_ID;
const targetFile = resolveSnapshotPath(command, docId, filePath);
const collabOrigin = `http://${config.env.HOST}:${config.env.COLLAB_SERVER_PORT}`;

try {
  if (command === 'save') {
    await runSave(docId, collabOrigin, targetFile, markdownPath, minify);
  } else if (command === 'load') {
    await runLoad(docId, collabOrigin, targetFile);
  } else {
    await runBackup(docId, collabOrigin, targetFile, markdownPath, minify);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

function resolveSnapshotPath(
  command: NonNullable<CliArguments['command']>,
  docId: string,
  filePath: CliArguments['filePath'],
): string {
  const fixturesRoot = path.resolve('tests/fixtures');
  const backupDir = path.join(config.env.DATA_DIR, 'backup');
  const defaultDir = command === 'backup' ? backupDir : fixturesRoot;

  const ensureJson = (target: string) => (path.extname(target) ? target : `${target}.json`);
  const sanitizeName = (name: string) => name.replaceAll(/[\\/]+/g, '_').replace(/^\.+/, '');

  if (!filePath) {
    const base = sanitizeName(docId || 'main');
    return path.join(defaultDir, ensureJson(base));
  }

  const absolutePath = path.resolve(filePath);
  if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isDirectory()) {
    const base = sanitizeName(docId || 'main');
    return path.join(absolutePath, ensureJson(base));
  }

  const withExt = ensureJson(absolutePath);

  if (command === 'load' && !fs.existsSync(withExt)) {
    const posixPath = filePath.split(path.win32.sep).join(path.posix.sep);
    const candidates = [
      path.join(fixturesRoot, ensureJson(posixPath)),
      path.join(fixturesRoot, ensureJson(path.basename(posixPath))),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return withExt;
}

async function runSave(
  docId: string,
  collabOrigin: string,
  filePath: string,
  markdownPath: string | null,
  minify: boolean
): Promise<void> {
  await withSession(docId, collabOrigin, async (editor) => {
    const editorState = editor.getEditorState().toJSON();
    const payload = minify ? stripEditorStateDefaults(editorState) : editorState;
    writeJson(filePath, payload);
    console.info(`[snapshot] save -> ${filePath}`);

    const shouldWriteMarkdown = markdownPath !== null;
    if (shouldWriteMarkdown) {
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
      console.info(`[snapshot] markdown -> ${absoluteMarkdownPath}`);
    }
  });
  await waitForPersistedData(docId);
}

async function runBackup(
  docId: string,
  collabOrigin: string,
  filePath: string,
  markdownPath: string | null,
  minify: boolean
): Promise<void> {
  await runSave(docId, collabOrigin, filePath, markdownPath, minify);
}

async function runLoad(docId: string, collabOrigin: string, filePath: string): Promise<void> {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as SerializedEditorState;
  const data = restoreEditorStateDefaults(raw);
  await withSession(docId, collabOrigin, async (editor, { session }) => {
    const done = waitForEditorUpdate(editor);
    editor.setEditorState(editor.parseEditorState(data), { tag: 'snapshot-load' });
    await done;
    await session.awaitSynced();
  });
  await waitForPersistedData(docId);
  console.info(`[snapshot] load <- ${filePath}`);
}

async function withSession(
  docId: string,
  collabOrigin: string,
  run: (editor: LexicalEditor, context: SessionContext) => Promise<void> | void
): Promise<void> {
  const docMap = new Map<string, Doc>();
  const session = new CollabSession({ enabled: true, docId, origin: collabOrigin });
  const attached = session.attach(docMap);
  if (!attached) {
    throw new Error('Collaboration disabled');
  }
  const provider = attached.provider as unknown as SnapshotProvider;
  (provider as unknown as { _WS?: typeof globalThis.WebSocket })._WS = WebSocket as unknown as typeof globalThis.WebSocket;
  const syncDoc = docMap.get(docId);
  if (!syncDoc) {
    throw new Error('Failed to resolve collaboration document.');
  }
  const editor = createEditor(
    createEditorInitialConfig() as CreateEditorArgs
  );
  const binding = createBindingV2__EXPERIMENTAL(editor, docId, syncDoc, docMap);
  const sharedRoot = binding.root as unknown as SharedRoot;
  const observer: SharedRootObserver = (events, transaction) => {
    if (transaction.origin === binding) {
      return;
    }
    syncYjsChangesToLexicalV2__EXPERIMENTAL(
      binding,
      provider,
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
      provider,
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
    await session.awaitSynced();
    syncYjsStateToLexicalV2__EXPERIMENTAL(binding, provider);
    await initialUpdate;
    editor.update(() => {
      $syncInternalNoteLinkNodeUrls(docId);
    });

    return await run(editor, { provider, session });
  } finally {
    sharedRoot.unobserveDeep(observer);
    removeUpdateListener();
    session.destroy();
    for (const doc of docMap.values()) {
      doc.destroy();
    }
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
