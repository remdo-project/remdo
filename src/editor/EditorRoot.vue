<script setup lang="ts">
import { computed } from 'vue';
import { env } from '#config/env-client';
import { LexicalComposer } from 'lexical-vue/LexicalComposer';
import { ListPlugin } from 'lexical-vue/LexicalListPlugin';
import { RichTextPlugin } from 'lexical-vue/LexicalRichTextPlugin';
import { useEditorConfig } from './config';
import IndentationPlugin from './plugins/IndentationPlugin.vue';
import { CollaborationPlugin } from './plugins/collaboration';
import RootSchemaPlugin from './plugins/RootSchemaPlugin.vue';
import SchemaValidationPlugin from './plugins/SchemaValidationPlugin.vue';
import TreeViewPlugin from './plugins/TreeViewPlugin.vue';
import EditorContentEditable from './components/EditorContentEditable.vue';

import './Editor.css';

const { initialConfig } = useEditorConfig();
const isDev = computed(() => env.isDev);
</script>

<template>
  <section class="editor-container">
    <LexicalComposer :initial-config="initialConfig">
      <RichTextPlugin>
        <template #contentEditable>
          <EditorContentEditable class="editor-input" />
        </template>
        <template #placeholder>
          <div class="editor-placeholder">
            Start writing your outline…
          </div>
        </template>
      </RichTextPlugin>
      <IndentationPlugin />
      <ListPlugin :has-strict-indent="true" />
      <CollaborationPlugin>
        <RootSchemaPlugin />
        <slot />
      </CollaborationPlugin>
      <SchemaValidationPlugin v-if="isDev" />
      <TreeViewPlugin v-if="isDev" />
    </LexicalComposer>
  </section>
</template>
