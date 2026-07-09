import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useCallback, useEffect, useRef } from 'react';
import { useCollaborationStatus } from '../collaboration';
import { assertEditorSchema } from './schema/assertEditorSchema';
import { consumeSchemaValidationSkipOnce } from '../../schema-validation-skip-once';
import { SCHEMA_VALIDATE_SYNC_TAG } from '#client/editor/update-tags';

export function SchemaValidationPlugin(): null {
  const [editor] = useLexicalComposerContext();
  const { hydrated, docEpoch, synced } = useCollaborationStatus();

  const validateSchema = useCallback((): boolean => {
    if (consumeSchemaValidationSkipOnce(editor)) {
      return false;
    }
    const state = editor.getEditorState().toJSON();
    assertEditorSchema(state);
    return true;
  }, [editor]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    return editor.registerUpdateListener(() => {
      if (!synced) {
        return;
      }
      validateSchema();
    });
  }, [editor, hydrated, docEpoch, synced, validateSchema]);

  const validatedEpochRef = useRef<number | null>(null);

  useEffect(() => {
    if (!hydrated || !synced || validatedEpochRef.current === docEpoch) {
      return;
    }

    // Validate once per document once it is hydrated and synced — covering both
    // the sync transition and a mount where the document is already synced (the
    // common case now that the dev plugins mount lazily). This is the dev/test
    // load-time assertion, catching malformed persisted/collab state at load
    // rather than only on a later edit; the prod RootSchemaPlugin repairs but
    // does not validate.
    validatedEpochRef.current = docEpoch;
    // Trigger a no-op update so the update listener validates within Lexical's cycle.
    editor.update(() => {}, { tag: SCHEMA_VALIDATE_SYNC_TAG });
  }, [editor, hydrated, docEpoch, synced]);

  return null;
}
