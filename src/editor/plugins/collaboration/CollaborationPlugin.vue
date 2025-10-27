<script setup lang="ts">
import { CollaborationPlugin as LexicalCollaborationPlugin } from 'lexical-vue/LexicalCollaborationPlugin';
import { HistoryPlugin } from 'lexical-vue/LexicalHistoryPlugin';
import { defineComponent, h } from 'vue';
import CollaborationProvider from './CollaborationProvider.vue';
import { useCollaborationStatus } from './collaborationStatus';

const DEFAULT_ROOM_ID = 'main';

const CollaborationRuntimePlugin = defineComponent({
  name: 'CollaborationRuntimePlugin',
  setup() {
    const status = useCollaborationStatus();

    return () => {
      if (!status.enabled) {
        return h(HistoryPlugin);
      }

      return h(LexicalCollaborationPlugin, {
        id: DEFAULT_ROOM_ID,
        providerFactory: status.providerFactory,
        shouldBootstrap: true,
      });
    };
  },
});
</script>

<template>
  <CollaborationProvider>
    <slot />
    <CollaborationRuntimePlugin />
  </CollaborationProvider>
</template>
