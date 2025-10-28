<script setup lang="ts">
import { useLexicalComposer } from 'lexical-vue/LexicalComposer';
import { TreeView } from 'lexical-vue/LexicalTreeView';

import './TreeViewPlugin.css';

const editor = useLexicalComposer();
</script>

<template>
  <section class="editor-tree-view" aria-label="Lexical tree view debugger">
    <TreeView
      :editor="editor"
      view-class-name="editor-tree-view-body"
      tree-type-button-class-name="editor-tree-view-hidden"
      time-travel-button-class-name="editor-tree-view-hidden"
      time-travel-panel-button-class-name="editor-tree-view-hidden"
      time-travel-panel-class-name="editor-tree-view-hidden"
      time-travel-panel-slider-class-name="editor-tree-view-hidden"
    />
  </section>
</template>
