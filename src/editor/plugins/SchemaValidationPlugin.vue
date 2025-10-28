<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { useLexicalComposer } from 'lexical-vue/LexicalComposer';
import { assertEditorSchema } from '@/editor/schema/assertEditorSchema';

const editor = useLexicalComposer();

let unregister: (() => void) | undefined;

onMounted(() => {
  unregister = editor.registerUpdateListener(() => {
    try {
      const state = editor.getEditorState().toJSON();
      assertEditorSchema(state);
    } catch (error) {
      console.error('[RemDo] Editor schema validation failed.', error);
    }
  });
});

onBeforeUnmount(() => {
  unregister?.();
});
</script>

<template>
  <slot />
</template>
