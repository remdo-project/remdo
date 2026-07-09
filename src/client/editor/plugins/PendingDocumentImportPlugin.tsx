import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot } from 'lexical';
import type { SerializedEditorState } from 'lexical';
import { useEffect } from 'react';

import { useCollaborationStatus } from './collaboration';
import { markSchemaValidationSkipOnce } from '../schema-validation-skip-once';
import { $normalizeNoteIdsOnLoad } from './note-id-normalization';
import { prepareEditorStateForRuntime } from '#client/editor/runtime/editor-state-persistence';
import { claimPendingDocumentImport } from '#client/editor/runtime/pending-document-import';
import { NOTE_ID_NORMALIZE_TAG, TEST_BRIDGE_LOAD_TAG } from '#client/editor/update-tags';

interface PendingDocumentImportPluginProps {
  onError: (error: Error) => void;
}

function waitForEditorUpdate(editor: ReturnType<typeof useLexicalComposerContext>[0]): Promise<void> {
  return new Promise((resolve) => {
    const unregister = editor.registerUpdateListener(() => {
      unregister();
      resolve();
    });
  });
}

export function PendingDocumentImportPlugin({ onError }: PendingDocumentImportPluginProps): null {
  const [editor] = useLexicalComposerContext();
  const { docId, hydrated, session } = useCollaborationStatus();

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    const pending = claimPendingDocumentImport(docId);
    if (!pending) {
      return;
    }

    const lifecycle = { cancelled: false };
    void (async () => {
      try {
        const input = await pending.file.text();
        if (lifecycle.cancelled) {
          return;
        }
        const persistedState = JSON.parse(input) as SerializedEditorState;
        const runtimeState = prepareEditorStateForRuntime(persistedState, docId);
        const parsed = editor.parseEditorState(runtimeState);

        const loadUpdate = waitForEditorUpdate(editor);
        markSchemaValidationSkipOnce(editor);
        editor.setEditorState(parsed, { tag: TEST_BRIDGE_LOAD_TAG });
        await loadUpdate;

        const normalizeUpdate = waitForEditorUpdate(editor);
        editor.update(() => {
          $normalizeNoteIdsOnLoad($getRoot(), docId);
        }, { tag: NOTE_ID_NORMALIZE_TAG });
        await normalizeUpdate;

        await session.awaitSynced();
      } catch (error) {
        if (!lifecycle.cancelled) {
          onError(error instanceof Error ? error : new Error('Failed to upload document.'));
        }
      }
    })();

    return () => {
      lifecycle.cancelled = true;
    };
  }, [docId, editor, hydrated, onError, session]);

  return null;
}
