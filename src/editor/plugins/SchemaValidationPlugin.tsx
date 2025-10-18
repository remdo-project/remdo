import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';
import { assertEditorSchema } from '@/editor/schema/assertEditorSchema';

export function SchemaValidationPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    return editor.registerUpdateListener(() => {
      try {
        const state = editor.getEditorState().toJSON();
        assertEditorSchema(state);
      } catch (error) {
        console.error('[RemDo] Editor schema validation failed.', error);
      }
    });
  }, [editor]);

  return null;
}

export default SchemaValidationPlugin;
