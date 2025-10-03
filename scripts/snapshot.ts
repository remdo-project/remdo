import fs from "node:fs/promises";
import path from "node:path";

import { AutoLinkNode, LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import {
  type Binding,
  type Provider,
  type SyncCursorPositionsFn,
  createBinding,
  syncLexicalUpdateToYjs,
  syncYjsChangesToLexical,
} from "@lexical/yjs";
import {
  SKIP_COLLAB_TAG,
  createEditor,
  type LexicalEditor,
} from "lexical";
import { WebsocketProvider } from "y-websocket";
import WebSocket from "ws";
import * as Y from "yjs";

const ENDPOINT = "ws://127.0.0.1:8080";
const ROOM_PREFIX = "notes/0/";
const DEFAULT_DATA_DIR = path.join("tests", "data");

const EXIT_CODES = {
  SUCCESS: 0,
  USAGE: 1,
  WEBSOCKET: 2,
  FILE: 3,
  SYNC_TIMEOUT: 4,
} as const;

type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

type Mode = "load" | "save";

type CollaborationContext = {
  editor: LexicalEditor;
  binding: Binding;
  provider: WebsocketProvider;
};

class CLIError extends Error {
  exitCode: ExitCode;

  constructor(message: string, exitCode: ExitCode) {
    super(message);
    this.exitCode = exitCode;
  }
}

async function main(): Promise<void> {
  const [modeArg, docId, fileArg] = process.argv.slice(2);
  if (modeArg !== "load" && modeArg !== "save") {
    throw new CLIError(
      "Usage: snapshot.ts <load|save> <docId> [filePath]",
      EXIT_CODES.USAGE,
    );
  }

  if (!docId) {
    throw new CLIError(
      "Usage: snapshot.ts <load|save> <docId> [filePath]",
      EXIT_CODES.USAGE,
    );
  }

  const mode: Mode = modeArg;
  const filePath = resolveFilePath(docId, fileArg);

  if (mode === "load") {
    await runLoad(docId, filePath);
  } else {
    await runSave(docId, filePath);
  }
}

function resolveFilePath(docId: string, fileArg?: string): string {
  if (fileArg) {
    return path.resolve(fileArg);
  }
  return path.resolve(path.join(DEFAULT_DATA_DIR, `${docId}.json`));
}

async function runLoad(docId: string, filePath: string): Promise<void> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (error) {
    throw new CLIError(
      `Failed to read file: ${filePath}. ${(error as Error).message}`,
      EXIT_CODES.FILE,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new CLIError(
      `Invalid JSON in ${filePath}: ${(error as Error).message}`,
      EXIT_CODES.FILE,
    );
  }

  if (!isPlainObject(parsed)) {
    throw new CLIError(
      `Expected bare Lexical JSON object in ${filePath}`,
      EXIT_CODES.FILE,
    );
  }

  await withCollaboration(docId, async ({ editor }) => {
    const editorState = editor.parseEditorState(JSON.stringify(parsed));
    editor.setEditorState(editorState);
  });
}

async function runSave(docId: string, filePath: string): Promise<void> {
  await withCollaboration(docId, async ({ editor }) => {
    await flushMicrotask();
    const state = editor.getEditorState();
    const json = state.toJSON();
    await writeJSON(filePath, json);
  });
}

async function withCollaboration(
  docId: string,
  callback: (ctx: CollaborationContext) => Promise<void>,
): Promise<void> {
  const roomName = `${ROOM_PREFIX}${docId}`;
  const doc = new Y.Doc();
  const provider = new WebsocketProvider(ENDPOINT, roomName, doc, {
    connect: true,
    WebSocketPolyfill: WebSocket,
  });

  const docMap = new Map<string, Y.Doc>();
  docMap.set(roomName, doc);

  const editor = createEditor({
    namespace: "notes",
    nodes: [ListItemNode, ListNode, LinkNode, AutoLinkNode],
    onError(error: Error) {
      throw error;
    },
  });

  const lexicalProvider = provider as unknown as Provider;
  const binding = createBinding(editor, lexicalProvider, roomName, doc, docMap);

  const syncCursorPositions: SyncCursorPositionsFn = () => {};

  const sharedRoot = binding.root.getSharedType();
  const onYjsTreeChanges = (
    events: Y.YEvent<Y.Text>[],
    transaction: Y.Transaction,
  ) => {
    if (transaction.origin === binding) {
      return;
    }
    const isFromUndoManager = transaction.origin instanceof Y.UndoManager;
    syncYjsChangesToLexical(
      binding,
      lexicalProvider,
      events,
      isFromUndoManager,
      syncCursorPositions,
    );
  };

  sharedRoot.observeDeep(onYjsTreeChanges);

  const unregisterUpdate = editor.registerUpdateListener(
    ({
      prevEditorState,
      editorState,
      dirtyLeaves,
      dirtyElements,
      normalizedNodes,
      tags,
    }) => {
      if (tags.has(SKIP_COLLAB_TAG)) {
        return;
      }
      syncLexicalUpdateToYjs(
        binding,
        lexicalProvider,
        prevEditorState,
        editorState,
        dirtyElements,
        dirtyLeaves,
        normalizedNodes,
        tags,
      );
    },
  );

  provider.connect();

  try {
    await waitForInitialSync(provider);
    await callback({ editor, binding, provider });
  } finally {
    unregisterUpdate();
    sharedRoot.unobserveDeep(onYjsTreeChanges);
    binding.root.destroy(binding);
    try {
      provider.disconnect();
    } catch {
      // ignore disconnect errors during shutdown
    }
    if (typeof (provider as unknown as { destroy?: () => void }).destroy === "function") {
      (provider as unknown as { destroy: () => void }).destroy();
    }
  }
}

async function waitForInitialSync(provider: WebsocketProvider): Promise<void> {
  if (provider.synced) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    let finished = false;
    const timeout = setTimeout(() => {
      if (finished) {
        return;
      }
      finished = true;
      cleanup();
      reject(new CLIError("Timed out waiting for initial sync", EXIT_CODES.SYNC_TIMEOUT));
    }, 10000);

    const handleSync = (isSynced: boolean) => {
      if (!isSynced || finished) {
        return;
      }
      finished = true;
      cleanup();
      resolve();
    };

    const handleConnectionError = (event: unknown) => {
      if (finished) {
        return;
      }
      finished = true;
      cleanup();
      const detail = event instanceof Error ? `: ${event.message}` : "";
      reject(new CLIError(`WebSocket connection error${detail}`, EXIT_CODES.WEBSOCKET));
    };

    const handleClose = () => {
      if (finished) {
        return;
      }
      finished = true;
      cleanup();
      reject(new CLIError("WebSocket connection closed", EXIT_CODES.WEBSOCKET));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      provider.off("sync", handleSync);
      provider.off("connection-error", handleConnectionError);
      provider.off("connection-close", handleClose);
    };

    provider.on("sync", handleSync);
    provider.on("connection-error", handleConnectionError);
    provider.on("connection-close", handleClose);
  });
}

async function writeJSON(filePath: string, value: unknown): Promise<void> {
  const data = stableStringify(value);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${data}\n`, "utf8");
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value), null, 2);
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (value && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortValue((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }

  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function flushMicrotask(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

main().catch((error) => {
  if (error instanceof CLIError) {
    console.error(error.message);
    process.exit(error.exitCode);
    return;
  }
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
