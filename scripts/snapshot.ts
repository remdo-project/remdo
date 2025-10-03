//TODO review and simply once the test exists
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { AutoLinkNode, LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import { createBinding, syncLexicalUpdateToYjs, syncYjsChangesToLexical } from "@lexical/yjs";
import type { Binding, Provider } from "@lexical/yjs";
import { createEditor } from "lexical";
import type { EditorState, LexicalEditor, SerializedEditorState } from "lexical";
import { WebsocketProvider } from "y-websocket";
import { Doc, UndoManager } from "yjs";
import WebSocket from "ws";

type Command = "load" | "save";

const ENDPOINT = "ws://127.0.0.1:8080";
const ROOM_PREFIX = "notes/0/";
const DEFAULT_DATA_DIR = path.join("tests", "data");
const SYNC_TIMEOUT_MS = 10000;

class CLIError extends Error {
  exitCode: number;

  constructor(exitCode: number, message: string) {
    super(message);
    this.exitCode = exitCode;
  }
}

interface ParsedArgs {
  command: Command;
  docId: string;
  filePath: string;
}

interface Session {
  editor: LexicalEditor;
  binding: Binding;
  provider: WebsocketProvider & Provider;
  doc: Doc;
  cleanup(): void;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command, docId, rawPath, ...rest] = argv;
  if (rest.length > 0) {
    throw new CLIError(1, "Usage: snapshot.ts <load|save> <docId> [filePath]");
  }
  if (command !== "load" && command !== "save") {
    throw new CLIError(1, "Usage: snapshot.ts <load|save> <docId> [filePath]");
  }
  if (!docId || docId.trim() === "") {
    throw new CLIError(1, "Missing document id");
  }
  const filePath = rawPath?.trim() || path.join(DEFAULT_DATA_DIR, `${docId}.json`);
  return { command, docId, filePath };
}

function readLexicalJSON(filePath: string): SerializedEditorState {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    throw new CLIError(3, `Failed to read file: ${filePath}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CLIError(3, `Invalid JSON in file: ${filePath}`);
  }
  if (!isSerializedEditorState(parsed)) {
    throw new CLIError(3, `File does not contain Lexical editor state: ${filePath}`);
  }
  return parsed;
}

function isSerializedEditorState(value: unknown): value is SerializedEditorState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const maybe = value as { root?: unknown };
  return !!maybe.root && typeof maybe.root === "object";
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value), null, 2);
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => a.localeCompare(b),
    );
    const result: Record<string, unknown> = {};
    for (const [key, inner] of entries) {
      result[key] = sortValue(inner);
    }
    return result;
  }
  return value;
}

function createSnapshotEditor(): LexicalEditor {
  return createEditor({
    namespace: "notes",
    nodes: [ListItemNode, ListNode, LinkNode, AutoLinkNode],
    onError(error) {
      throw error;
    },
  });
}

function waitForNextEditorUpdate(editor: LexicalEditor, timeoutMs = 1000): Promise<void> {
  return new Promise((resolve) => {
    let resolved = false;
    const unregister = editor.registerUpdateListener(() => {
      if (resolved) {
        return;
      }
      resolved = true;
      clearTimeout(timer);
      unregister();
      resolve();
    });
    const timer = setTimeout(() => {
      if (resolved) {
        return;
      }
      resolved = true;
      unregister();
      resolve();
    }, timeoutMs);
  });
}

function waitForProviderSync(provider: WebsocketProvider & Provider): Promise<void> {
  if ((provider as WebsocketProvider).synced) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    let connected = false;
    let finished = false;
    const cleanup = () => {
      if (finished) {
        return;
      }
      finished = true;
      provider.off("status", onStatus);
      provider.off("sync", onSync);
      provider.off("connection-close", onClose);
      provider.off("connection-error", onClose);
      clearTimeout(timer);
    };
    const onStatus = (event: { status: string }) => {
      if (event.status === "connected") {
        connected = true;
        return;
      }
      if (!connected && event.status === "disconnected") {
        cleanup();
        reject(new CLIError(2, "Failed to connect to collaboration server"));
      }
    };
    const onSync = (isSynced: boolean) => {
      if (!isSynced) {
        return;
      }
      cleanup();
      resolve();
    };
    const onClose = () => {
      cleanup();
      reject(new CLIError(2, "Connection closed before sync"));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new CLIError(4, "Timed out waiting for collaboration sync"));
    }, SYNC_TIMEOUT_MS);
    provider.on("status", onStatus);
    provider.on("sync", onSync);
    provider.on("connection-close", onClose);
    provider.on("connection-error", onClose);
  });
}

async function createSession(docId: string): Promise<Session> {
  const roomName = `${ROOM_PREFIX}${docId}`;
  const doc = new Doc();
  const docMap = new Map<string, Doc>();
  docMap.set(roomName, doc);
  const provider = new WebsocketProvider(ENDPOINT, roomName, doc, {
    connect: false,
    WebSocketPolyfill: WebSocket,
  }) as WebsocketProvider & Provider;
  const editor = createSnapshotEditor();
  const binding = createBinding(editor, provider, roomName, doc, docMap);
  const sharedRoot = binding.root.getSharedType();

  const observer = (
    events: Array<unknown>,
    transaction: { origin: unknown },
  ) => {
    if (transaction.origin === binding) {
      return;
    }
    const isFromUndoManager = transaction.origin instanceof UndoManager;
    syncYjsChangesToLexical(
      binding,
      provider,
      events as any,
      isFromUndoManager,
    );
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
    binding,
    provider,
    doc,
    cleanup() {
      sharedRoot.unobserveDeep(observer);
      removeUpdateListener();
      provider.destroy();
      binding.root.destroy(binding);
      doc.destroy();
    },
  };
}

async function applyEditorState(
  editor: LexicalEditor,
  state: EditorState,
): Promise<void> {
  const updatePromise = waitForNextEditorUpdate(editor);
  editor.setEditorState(state, {
    tag: "snapshot-load",
  });
  await updatePromise;
}

async function runSave(docId: string, filePath: string): Promise<void> {
  const session = await createSession(docId);
  try {
    const json = session.editor.getEditorState().toJSON();
    const serialized = stableStringify(json);
    fs.writeFileSync(filePath, `${serialized}\n`);
  } finally {
    session.cleanup();
  }
}

async function runLoad(docId: string, filePath: string): Promise<void> {
  const editorState = readLexicalJSON(filePath);
  const session = await createSession(docId);
  try {
    const parsed = session.editor.parseEditorState(editorState);
    await applyEditorState(session.editor, parsed);
  } finally {
    session.cleanup();
  }
}

async function main(): Promise<void> {
  try {
    const parsed = parseArgs(process.argv.slice(2));
    if (parsed.command === "save") {
      await runSave(parsed.docId, parsed.filePath);
    } else {
      await runLoad(parsed.docId, parsed.filePath);
    }
  } catch (error) {
    if (error instanceof CLIError) {
      console.error(error.message);
      process.exitCode = error.exitCode;
      return;
    }
    console.error(error);
    process.exitCode = 1;
  }
}

void main();
