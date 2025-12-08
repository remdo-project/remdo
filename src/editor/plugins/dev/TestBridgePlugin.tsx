import { useEffect, useMemo } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { LexicalCommand, LexicalEditor, EditorUpdateOptions, SerializedEditorState } from 'lexical';
import { $getRoot } from 'lexical';
import { assertEditorSchema } from '@/editor/schema/assertEditorSchema';
import { useCollaborationStatus } from '../collaboration';

async function withTimeout<T>(fnOrPromise: (() => Promise<T>) | Promise<T>, ms: number, message: string): Promise<T> {
  const promise = typeof fnOrPromise === 'function' ? fnOrPromise() : fnOrPromise;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

type EditorStateJSON = ReturnType<ReturnType<LexicalEditor['getEditorState']>['toJSON']>;

type EditorOutcome =
  | { status: 'update' }
  | { status: 'noop' }
  | { status: 'error'; error: unknown };

type EditorOutcomeExpectation = 'update' | 'noop' | 'any';

interface EditorActionOptions {
  expect?: EditorOutcomeExpectation;
}

export interface RemdoTestApi {
  editor: LexicalEditor;
  applySerializedState: (input: string) => Promise<void>;
  replaceDocument: (input: string) => Promise<void>;
  mutate: (fn: () => void, opts?: EditorUpdateOptions) => Promise<void>;
  validate: <T>(fn: () => T) => T;
  getEditorState: () => EditorStateJSON;
  waitForSynced: () => Promise<void>;
  waitForCollaborationReady: (timeoutMs?: number) => Promise<void>;
  getCollabDocId: () => string;
  dispatchCommand: (command: LexicalCommand<unknown>, payload?: unknown, opts?: EditorActionOptions) => Promise<void>;
  clear: () => Promise<void>;
}

declare global {
  interface Window {
    remdoTest?: RemdoTestApi;
  }
}

function hasPendingEditorUpdate(editor: LexicalEditor): boolean {
  const internal = editor as LexicalEditor & {
    _pendingEditorState: unknown | null;
    _updates: Array<unknown>;
    _updating: boolean;
  };

  return internal._pendingEditorState != null || internal._updates.length > 0 || internal._updating;
}

function assertOutcome(result: EditorOutcome, action: string, expect: EditorOutcomeExpectation) {
  if (result.status === 'error') {
    throw result.error;
  }

  if (expect !== 'any' && result.status !== expect) {
    throw new Error(`TestBridgePlugin: ${action} expected ${expect}, got ${result.status}`);
  }
}

function registerEditorErrorListener(editor: LexicalEditor, listener: (error: unknown) => void): () => void {
  const internal = editor as LexicalEditor & { _onError: (error: unknown) => void };
  const previous = internal._onError;

  internal._onError = (error: unknown) => {
    listener(error);
    previous(error);
  };

  return () => {
    internal._onError = previous;
  };
}

function awaitEditorOutcome(editor: LexicalEditor) {
  let settled = false;
  let resolveOutcome: (outcome: EditorOutcome) => void = () => {};

  const cleanupFns: Array<() => void> = [];

  const cleanup = () => {
    while (cleanupFns.length > 0) {
      const fn = cleanupFns.pop();
      fn?.();
    }
  };

  const settle = (result: EditorOutcome) => {
    if (settled) return;
    settled = true;
    cleanup();
    resolveOutcome(result);
  };

  const outcome = new Promise<EditorOutcome>((resolve) => {
    resolveOutcome = resolve;
  });

  cleanupFns.push(
    registerEditorErrorListener(editor, (error) => settle({ status: 'error', error })),
    editor.registerUpdateListener(() => settle({ status: 'update' }))
  );

  const noopGuard = setTimeout(() => {
    if (!settled && !hasPendingEditorUpdate(editor)) {
      settle({ status: 'noop' });
    }
  }, 0);

  cleanupFns.push(() => clearTimeout(noopGuard));

  const reportNoop = () => settle({ status: 'noop' });

  return { outcome, reportNoop };
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

    const applySerializedState = async (input: string) => {
      await ensureHydrated();
      const parsed = editor.parseEditorState(JSON.parse(input) as SerializedEditorState);
      const outcome = awaitEditorOutcome(editor);
      editor.setEditorState(parsed, { tag: 'test-bridge-load' });
      const result = await outcome.outcome;
      assertOutcome(result, 'setEditorState', 'update');
      await collab.awaitSynced();
    };

    const mutate = async (fn: () => void, opts?: EditorUpdateOptions) => {
      if (fn.constructor.name === 'AsyncFunction') {
        throw new TypeError('TestBridgePlugin: mutate callback must be synchronous');
      }

      const tag = ['test-bridge-mutate', ...(Array.isArray(opts?.tag) ? opts.tag : opts?.tag ? [opts.tag] : [])];
      const outcome = awaitEditorOutcome(editor);

      editor.update(fn, { ...opts, tag });
      const result = await outcome.outcome;
      assertOutcome(result, 'mutate', 'update');
      assertEditorSchema(editor.getEditorState().toJSON());
      await collab.awaitSynced();
    };

    const dispatchCommand = async (command: LexicalCommand<unknown>, payload?: unknown, opts?: EditorActionOptions) => {
      const expect = opts?.expect ?? 'update';
      const outcome = awaitEditorOutcome(editor);
      const didDispatch = editor.dispatchCommand(command, payload as never);
      if (!didDispatch) {
        outcome.reportNoop();
      }

      const result = await outcome.outcome;
      assertOutcome(result, 'dispatchCommand', expect);
      await collab.awaitSynced();
    };

    const clear = async () => {
      await mutate(() => {
        $getRoot().clear();
      });
    };

    const getEditorState = () => editor.getEditorState().toJSON();
    const validate = <T,>(fn: () => T) => editor.getEditorState().read(fn);

    const waitForSynced = async () => {
      await collab.awaitSynced();
      assertEditorSchema(getEditorState());
    };

    return {
      editor,
      applySerializedState,
      replaceDocument: applySerializedState,
      mutate,
      validate,
      getEditorState,
      waitForSynced,
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
