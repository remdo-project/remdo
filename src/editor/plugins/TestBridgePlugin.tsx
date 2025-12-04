import { useEffect, useMemo } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { LexicalCommand, LexicalEditor, EditorUpdateOptions, SerializedEditorState } from 'lexical';
import { $getRoot } from 'lexical';
import { useCollaborationStatus } from './collaboration';

async function withTimeout<T>(fnOrPromise: (() => Promise<T>) | Promise<T>, ms: number, message: string): Promise<T> {
  const promise = typeof fnOrPromise === 'function' ? fnOrPromise() : fnOrPromise;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

type EditorStateJSON = ReturnType<ReturnType<LexicalEditor['getEditorState']>['toJSON']>;

interface RemdoTestApi {
  load: (input: string) => Promise<void>;
  replaceDocument: (input: string) => Promise<void>;
  mutate: (fn: () => void, opts?: EditorUpdateOptions) => Promise<void>;
  validate: <T>(fn: () => T) => T;
  getEditorState: () => EditorStateJSON;
  waitForSynced: () => Promise<void>;
  waitForCollaborationReady: (timeoutMs?: number) => Promise<void>;
  getCollabDocId: () => string;
  dispatchCommand: (command: LexicalCommand<unknown>, payload?: unknown) => Promise<void>;
  clear: () => Promise<void>;
}

declare global {
  interface Window {
    remdoTest?: RemdoTestApi;
  }
}

async function waitForNextUpdate(editor: LexicalEditor): Promise<void> {
  return withTimeout(
    new Promise<void>((resolve) => {
      const off = editor.registerUpdateListener(() => {
        off();
        resolve();
      });
    }),
    1000,
    'TestBridgePlugin: timed out waiting for editor update'
  );
}

export function TestBridgePlugin() {
  const [editor] = useLexicalComposerContext();
  const collab = useCollaborationStatus();

  const api = useMemo<RemdoTestApi>(() => {
    const ensureHydrated = async () => {
      if (!collab.enabled || collab.hydrated) return;
      await collab.awaitSynced();
    };

    const waitForCollaborationReady = async (timeoutMs = 2000) => {
      if (!collab.enabled) return;
      if (collab.hydrated && collab.synced) return;

      await withTimeout(
        collab.awaitSynced,
        timeoutMs,
        'TestBridgePlugin: collaboration readiness timed out'
      );
    };

    const load = async (input: string) => {
      await ensureHydrated();
      const parsed = editor.parseEditorState(
        JSON.parse(input).editorState as SerializedEditorState
      );
      const updateDone = waitForNextUpdate(editor);
      editor.setEditorState(parsed, { tag: 'test-bridge-load' });
      await updateDone;
      await collab.awaitSynced();
    };

    const mutate = async (fn: () => void, opts?: EditorUpdateOptions) => {
      if (fn.constructor.name === 'AsyncFunction') {
        throw new TypeError('TestBridgePlugin: mutate callback must be synchronous');
      }

      const tag = ['test-bridge-mutate', ...(Array.isArray(opts?.tag) ? opts.tag : opts?.tag ? [opts.tag] : [])];
      const updateDone = waitForNextUpdate(editor);

      editor.update(fn, { ...opts, tag });
      await updateDone;
      await collab.awaitSynced();
    };

    const dispatchCommand = async (command: LexicalCommand<unknown>, payload?: unknown) => {
      const updateDone = waitForNextUpdate(editor).catch(() => {});
      editor.dispatchCommand(command, payload as never);
      await updateDone;
      await collab.awaitSynced();
    };

    const clear = async () => {
      await mutate(() => {
        $getRoot().clear();
      });
    };

    const getEditorState = () => editor.getEditorState().toJSON();
    const validate = <T,>(fn: () => T) => editor.getEditorState().read(fn);

    return {
      load,
      replaceDocument: load,
      mutate,
      validate,
      getEditorState,
      waitForSynced: collab.awaitSynced,
      waitForCollaborationReady,
      getCollabDocId: () => collab.docId,
      dispatchCommand,
      clear,
    } satisfies RemdoTestApi;
  }, [collab, editor]);

  useEffect(() => {
    const previous = globalThis.window.remdoTest;
    globalThis.window.remdoTest = api;

    return () => {
      if (globalThis.window.remdoTest === api) {
        delete globalThis.window.remdoTest;
      } else {
        globalThis.window.remdoTest = previous;
      }
    };
  }, [api]);

  return null;
}

export default TestBridgePlugin;
