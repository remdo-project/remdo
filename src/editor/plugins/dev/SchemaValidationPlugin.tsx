import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useCallback, useEffect, useRef } from 'react';
import { useCollaborationStatus } from '../collaboration';
import { assertEditorSchema } from './schema/assertEditorSchema';
import { consumeSchemaValidationSkipOnce } from './schema/schemaValidationSkipOnce';

export function SchemaValidationPlugin(): null {
  const [editor] = useLexicalComposerContext();
  const { hydrated, docEpoch, synced } = useCollaborationStatus();
  const wasSyncedRef = useRef(synced);

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
      try {
        if (!synced) {
          return;
        }
        validateSchema();
      } catch (error) {
        console.error('[RemDo] Editor schema validation failed.', error);
      }
    });
  }, [editor, hydrated, docEpoch, synced, validateSchema]);

  useEffect(() => {
    if (!hydrated) {
      wasSyncedRef.current = synced;
      return;
    }

    if (synced && !wasSyncedRef.current) {
      // Trigger a no-op update so the update listener validates within Lexical's cycle.
      editor.update(() => {}, { tag: 'schema-validate-sync' });
    }

    wasSyncedRef.current = synced;
  }, [editor, hydrated, docEpoch, synced, validateSchema]);

  return null;
}

export default SchemaValidationPlugin;
