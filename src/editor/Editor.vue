<script setup lang="ts">
import { env } from '#config/env-client';
import { LexicalComposer } from 'lexical-vue/LexicalComposer';
import { ContentEditable } from 'lexical-vue/LexicalContentEditable';
import { ListPlugin } from 'lexical-vue/LexicalListPlugin';
import { RichTextPlugin } from 'lexical-vue/LexicalRichTextPlugin';
import CollaborationPlugin from './plugins/collaboration/CollaborationPlugin.vue';
import { IndentationPlugin } from './plugins/IndentationPlugin';
import { RootSchemaPlugin } from './plugins/RootSchemaPlugin';
import { SchemaValidationPlugin } from './plugins/SchemaValidationPlugin';
import { TreeViewPlugin } from './plugins/TreeViewPlugin';
import { useEditorConfig } from './config';
import './Editor.css';

const { initialConfig } = useEditorConfig();
const isDev = env.isDev;
</script>

<template>
  <div class="editor-container">
    <LexicalComposer :initial-config="initialConfig">
      <RichTextPlugin>
        <template #contentEditable>
          <ContentEditable class="editor-input">
            <template #placeholder>
              <div class="editor-placeholder">
                Start typing your outline…
              </div>
            </template>
          </ContentEditable>
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
  </div>
</template>
