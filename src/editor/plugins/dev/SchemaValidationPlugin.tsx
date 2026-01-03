import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';
import { useCollaborationStatus } from '../collaboration';
import { assertEditorSchema } from './schema/assertEditorSchema';
import { consumeSchemaValidationSkipOnce } from './schema/schemaValidationSkipOnce';

export function SchemaValidationPlugin(): null {
  const [editor] = useLexicalComposerContext();
  const { hydrated, docEpoch } = useCollaborationStatus();

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    return editor.registerUpdateListener(() => {
      try {
        if (consumeSchemaValidationSkipOnce(editor)) {
          return;
        }
        const state = editor.getEditorState().toJSON();
        assertEditorSchema(state);
      } catch (error) {
        console.error('[RemDo] Editor schema validation failed.', error);
      }
    });
  }, [editor, hydrated, docEpoch]);

  return null;
}

export default SchemaValidationPlugin;
