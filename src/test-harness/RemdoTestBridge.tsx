import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $isListItemNode, $isListNode } from "@lexical/list";
import {
  CLEAR_HISTORY_COMMAND,
  $getRoot,
  COMMAND_PRIORITY_LOW,
  SKIP_COLLAB_TAG,
  type LexicalEditor,
} from "lexical";
import {
  ensureListItemSharedState,
  restoreRemdoStateFromJSON,
} from "@/features/editor/plugins/remdo/utils/noteState";
import { getNotesFromSelection } from "@/features/editor/plugins/remdo/utils/api";
import {
  NOTES_OPEN_QUICK_MENU_COMMAND,
  YJS_SYNCED_COMMAND,
} from "@/features/editor/plugins/remdo/utils/commands";
import { getOffsetPosition } from "@/utils";

export default function RemdoTestBridge(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (import.meta.env.PROD && !window.REMDO_TEST) {
      return;
    }

    const { api, dispose } = createAPI(editor);
    window.remdoTest = api;

    return () => {
      if (window.remdoTest === api) {
        delete window.remdoTest;
      }
      dispose();
    };
  }, [editor]);

  return null;
}

function createAPI(editor: LexicalEditor) {
  const disposables: Array<() => void> = [];
  const searchParams = new URLSearchParams(window.location.search);
  const collabParam = searchParams.get("collab");
  const legacyWsParam = searchParams.get("ws");
  const collabDisabled =
    collabParam !== null ? collabParam === "false" : legacyWsParam === "false";
  const collabEnabled = !collabDisabled;
  let isYjsSynced = !collabEnabled;

  type Waiter = {
    resolve: () => void;
    reject: (error: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  };

  const waiters = new Set<Waiter>();

  const notifySynced = () => {
    if (isYjsSynced) {
      return;
    }
    isYjsSynced = true;
    for (const waiter of waiters) {
      clearTimeout(waiter.timeoutId);
      waiter.resolve();
    }
    waiters.clear();
  };

  if (collabEnabled) {
    disposables.push(
      editor.registerCommand(
        YJS_SYNCED_COMMAND,
        () => {
          notifySynced();
          return false;
        },
        COMMAND_PRIORITY_LOW
      )
    );
  }

  const api = {
    async replaceDocument(editorStateJson: unknown): Promise<void> {
      const serialized =
        typeof editorStateJson === "string" ? editorStateJson : JSON.stringify(editorStateJson);
      const parsedState = parseEditorState(serialized);

      ensureListItemSharedState(editor as unknown as { _nodes?: Map<string, unknown> });

      const nextState = editor.parseEditorState(serialized);
      if (collabEnabled) {
        await api.waitForCollaborationReady();
        await runAndWaitForCommit(editor, () => {
          editor.setEditorState(nextState);
        });

        if (parsedState?.root !== undefined) {
          await runAndWaitForCommit(editor, () => {
            editor.update(
              () => {
                restoreRemdoStateFromJSON(editor, parsedState.root);
              },
            );
          });
        }

        editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);

        await runAndWaitForCommit(editor, () => {
          editor.update(
            () => {
              const root = $getRoot();
              const lastList = root.getLastChild();
              if ($isListNode(lastList)) {
                const lastItem = lastList.getLastChild();
                if ($isListItemNode(lastItem)) {
                  lastItem.selectEnd();
                  return;
                }
              }
              root.selectEnd();
            },
            { tag: SKIP_COLLAB_TAG }
          );
        });

        return;
      }

      await runAndWaitForCommit(editor, () => {
        editor.setEditorState(nextState);
      });

      if (parsedState?.root !== undefined) {
        await runAndWaitForCommit(editor, () => {
          restoreRemdoStateFromJSON(editor, parsedState.root);
        });
      }

      editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);

      await runAndWaitForCommit(editor, () => {
        editor.update(() => {
          const root = $getRoot();
          const lastList = root.getLastChild();
          if ($isListNode(lastList)) {
            const lastItem = lastList.getLastChild();
            if ($isListItemNode(lastItem)) {
              lastItem.selectEnd();
              return;
            }
          }
          root.selectEnd();
        });
      });
    },
    async waitForCollaborationReady(timeoutMs = 5000): Promise<void> {
      if (!collabEnabled || isYjsSynced) {
        return;
      }

      await new Promise<void>((resolve, reject) => {
        const waiter: Waiter = {
          resolve: () => {
            clearTimeout(waiter.timeoutId);
            waiters.delete(waiter);
            resolve();
          },
          reject: (error: Error) => {
            clearTimeout(waiter.timeoutId);
            waiters.delete(waiter);
            reject(error);
          },
          timeoutId: setTimeout(() => {
            waiters.delete(waiter);
            reject(new Error(`waitForCollaborationReady timed out after ${timeoutMs}ms`));
          }, timeoutMs),
        };
        waiters.add(waiter);
      });
    },
    //TODO this should be implemented on the test level
    async openQuickMenuFromSelection(): Promise<void> {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        throw new Error("openQuickMenuFromSelection: no active selection range");
      }

      const range = selection.getRangeAt(0);
      const { left, top } = getOffsetPosition(editor, range);
      const noteKeys = editor.read(() =>
        getNotesFromSelection().map((note) => note.lexicalKey)
      );

      editor.dispatchCommand(NOTES_OPEN_QUICK_MENU_COMMAND, {
        left,
        top,
        noteKeys,
      });
    },
  };

  return {
    api,
    dispose: () => {
      for (const waiter of waiters) {
        clearTimeout(waiter.timeoutId);
        waiter.resolve();
      }
      waiters.clear();
      for (const dispose of disposables) {
        dispose();
      }
    },
  };
}

function runAndWaitForCommit(editor: LexicalEditor, action: () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe: (() => void) | undefined;

    const cleanup = () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = undefined;
      }
    };

    unsubscribe = editor.registerUpdateListener(() => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve();
    });

    try {
      action();
    } catch (error) {
      if (!settled) {
        settled = true;
        cleanup();
      }
      reject(error);
      return;
    }

    timeoutId = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve();
    });
  });
}

function parseEditorState(serialized: string): { root?: unknown } | undefined {
  try {
    const parsed = JSON.parse(serialized);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as { root?: unknown };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

declare global {
  interface Window {
    remdoTest?: {
      replaceDocument: (editorStateJson: unknown) => Promise<void>;
      waitForCollaborationReady: (timeoutMs?: number) => Promise<void>;
      openQuickMenuFromSelection: () => Promise<void>;
    };
    REMDO_TEST?: boolean;
  }
}
