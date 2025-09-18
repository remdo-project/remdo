import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $isListItemNode, $isListNode } from "@lexical/list";
import { CLEAR_HISTORY_COMMAND, $getRoot, type LexicalEditor } from "lexical";
import {
  ensureListItemSharedState,
  restoreRemdoStateFromJSON,
} from "@/components/Editor/plugins/remdo/utils/noteState";

export default function RemdoTestBridge(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (import.meta.env.PROD && !window.REMDO_TEST) {
      return;
    }

    const api = createAPI(editor);
    window.remdoTest = api;

    return () => {
      if (window.remdoTest === api) {
        delete window.remdoTest;
      }
    };
  }, [editor]);

  return null;
}

function createAPI(editor: LexicalEditor) {
  return {
    async replaceDocument(editorStateJson: unknown): Promise<void> {
      if ((editor as unknown as { __collab?: { enabled?: boolean } }).__collab?.enabled) {
        throw new Error("replaceDocument: collab mode is enabled. Disable Yjs for this test.");
      }

      const serialized =
        typeof editorStateJson === "string" ? editorStateJson : JSON.stringify(editorStateJson);
      const parsedState = parseEditorState(serialized);

      ensureListItemSharedState(editor as unknown as { _nodes?: Map<string, unknown> });

      const nextState = editor.parseEditorState(serialized);
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
      replaceDocument(editorStateJson: unknown): Promise<void>;
    };
    REMDO_TEST?: boolean;
  }
}
