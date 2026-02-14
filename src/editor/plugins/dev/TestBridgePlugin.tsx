import { useEffect, useMemo } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { LexicalCommand, LexicalEditor, EditorUpdateOptions, SerializedEditorState } from 'lexical';
import { $createTextNode, $getRoot, $isTextNode } from 'lexical';
import { prepareEditorStateForRuntime } from '#lib/editor/editor-state-persistence';
import { assertEditorSchema } from './schema/assertEditorSchema';
import { useCollaborationStatus } from '../collaboration';
import { markSchemaValidationSkipOnce } from './schema/schemaValidationSkipOnce';
import { $normalizeNoteIdsOnLoad } from '../note-id-normalization';
import { $findNoteById } from '@/editor/outline/note-traversal';
import { TEST_BRIDGE_LOAD_TAG, TEST_BRIDGE_MUTATE_TAG } from '@/editor/update-tags';

async function withTimeout<T>(fnOrPromise: (() => Promise<T>) | Promise<T>, ms: number, message: string): Promise<T> {
  const promise = typeof fnOrPromise === 'function' ? fnOrPromise() : fnOrPromise;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

type EditorOutcome =
  | { status: 'update' }
  | { status: 'noop' }
  | { status: 'error'; error: unknown }
  | { status: 'timeout' };

type EditorOutcomeExpectation = 'update' | 'noop' | 'any';

interface EditorActionOptions {
  expect?: EditorOutcomeExpectation;
}

interface ApplySerializedStateOptions {
  skipSchemaValidationOnce?: boolean;
}

function hasPendingEditorUpdate(editor: LexicalEditor): boolean {
  const internal = editor as LexicalEditor & {
    _pendingEditorState: unknown | null;
    _updates: Array<unknown>;
    _updating: boolean;
  };

  return internal._pendingEditorState != null || internal._updates.length > 0 || internal._updating;
}

function handleOutcome(result: EditorOutcome, action: string, expect: EditorOutcomeExpectation): EditorOutcome {
  if (result.status === 'error') {
    throw result.error;
  }

  if (result.status === 'timeout') {
    console.warn(`TestBridgePlugin: ${action} timed out waiting for editor outcome`);
    return result;
  }

  if (expect !== 'any' && result.status !== expect) {
    throw new Error(`TestBridgePlugin: ${action} expected ${expect}, got ${result.status}`);
  }

  return result;
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

function awaitEditorOutcome(editor: LexicalEditor, timeoutMs = 1000) {
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

  const timeout = setTimeout(() => {
    settle({ status: 'timeout' });
  }, timeoutMs);

  cleanupFns.push(() => clearTimeout(timeout));

  const reportNoop = () => settle({ status: 'noop' });

  return { outcome, reportNoop };
}

function createTestBridgeApi(editor: LexicalEditor, collab: ReturnType<typeof useCollaborationStatus>) {
  const ensureHydrated = async () => {
    if (!collab.enabled || collab.hydrated) return;
    await collab.awaitSynced();
  };

  const withOutcome = async (
    action: string,
    expect: EditorOutcomeExpectation,
    run: (reportNoop: () => void) => void,
    options?: { skipSchemaValidation?: boolean }
  ) => {
    const outcome = awaitEditorOutcome(editor);
    run(outcome.reportNoop);
    const result = handleOutcome(await outcome.outcome, action, expect);
    if (result.status === 'update') {
      if (!options?.skipSchemaValidation) {
        assertEditorSchema(editor.getEditorState().toJSON());
      }
      await collab.awaitSynced();
    }
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

  const applySerializedState = async (input: string, options?: ApplySerializedStateOptions) => {
    await ensureHydrated();
    const runtimeState = prepareEditorStateForRuntime(JSON.parse(input) as SerializedEditorState, collab.docId);
    const parsed = editor.parseEditorState(runtimeState);
    await withOutcome('setEditorState', 'update', () => {
      if (options?.skipSchemaValidationOnce) {
        markSchemaValidationSkipOnce(editor);
      }
      editor.setEditorState(parsed, { tag: TEST_BRIDGE_LOAD_TAG });
    }, { skipSchemaValidation: options?.skipSchemaValidationOnce });

    if (options?.skipSchemaValidationOnce) {
      await withOutcome('normalizeNoteIds', 'any', () => {
        editor.update(() => {
          $normalizeNoteIdsOnLoad($getRoot(), collab.docId);
        });
      }, { skipSchemaValidation: true });
    }
  };

  const mutate = async (fn: () => void, opts?: EditorUpdateOptions) => {
    if (fn.constructor.name === 'AsyncFunction') {
      throw new TypeError('TestBridgePlugin: mutate callback must be synchronous');
    }

    const tag = [TEST_BRIDGE_MUTATE_TAG, ...(Array.isArray(opts?.tag) ? opts.tag : opts?.tag ? [opts.tag] : [])];
    await withOutcome('mutate', 'update', () => editor.update(fn, { ...opts, tag }));
  };

  const dispatchCommand = async (command: LexicalCommand<unknown>, payload?: unknown, opts?: EditorActionOptions) => {
    const expect = opts?.expect ?? 'update';
    await withOutcome('dispatchCommand', expect, (reportNoop) => {
      const didDispatch = editor.dispatchCommand(command, payload);
      if (!didDispatch) {
        reportNoop();
      }
    });
  };

  const clear = async () => {
    await mutate(() => {
      $getRoot().clear();
    });
  };

  const updateNoteText = async (noteId: string, text: string) => {
    await mutate(() => {
      const item = $findNoteById(noteId);
      if (!item) {
        return;
      }

      const textNode = item.getChildren().find((child): child is ReturnType<typeof $createTextNode> => $isTextNode(child));
      if (textNode) {
        textNode.setTextContent(text);
        return;
      }

      item.append($createTextNode(text));
    });
  };

  const getEditorState = () => editor.getEditorState().toJSON();
  const validate = <T,>(fn: () => T) => editor.getEditorState().read(fn);

  const waitForSynced = async () => {
    await collab.awaitSynced();
    assertEditorSchema(getEditorState());
  };

  const getCollabDocId = () => collab.docId;

  const bridge = {
    applySerializedState,
    replaceDocument: applySerializedState,
    waitForCollaborationReady,
    clear,
  };

  return {
    editor,
    mutate,
    validate,
    getEditorState,
    waitForSynced,
    updateNoteText,
    dispatchCommand,
    getCollabDocId,
    _bridge: bridge,
  };
}

export type RemdoTestApi = ReturnType<typeof createTestBridgeApi>;

export function TestBridgePlugin({
  onTestBridgeReady,
  onTestBridgeDispose,
}: {
  onTestBridgeReady?: (api: RemdoTestApi) => void;
  onTestBridgeDispose?: () => void;
}) {
  const [editor] = useLexicalComposerContext();
  const collab = useCollaborationStatus();

  const api = useMemo(() => createTestBridgeApi(editor, collab), [collab, editor]);

  useEffect(() => {
    onTestBridgeReady?.(api);
    (globalThis as typeof globalThis & { __remdoBridgePromise?: Promise<RemdoTestApi> }).__remdoBridgePromise = Promise.resolve(api);

    return () => {
      onTestBridgeDispose?.();
      (globalThis as typeof globalThis & { __remdoBridgePromise?: Promise<RemdoTestApi> }).__remdoBridgePromise = undefined;
    };
  }, [api, onTestBridgeReady, onTestBridgeDispose]);

  return null;
}
