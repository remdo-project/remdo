import { useLexicalComposer } from 'lexical-vue/LexicalComposer';
import { defineComponent, onMounted, onUnmounted } from 'vue';
import { assertEditorSchema } from '@/editor/schema/assertEditorSchema';

export const SchemaValidationPlugin = defineComponent({
  name: 'SchemaValidationPlugin',
  setup() {
    const editor = useLexicalComposer();

    onMounted(() => {
      const unregister = editor.registerUpdateListener(() => {
        try {
          const state = editor.getEditorState().toJSON();
          assertEditorSchema(state);
        } catch (error) {
          console.error('[RemDo] Editor schema validation failed.', error);
        }
      });

      onUnmounted(unregister);
    });

    return () => null;
  },
});
