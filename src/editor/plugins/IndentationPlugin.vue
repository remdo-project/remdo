<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { $isListItemNode } from '@lexical/list';
import { useLexicalComposer } from 'lexical-vue/LexicalComposer';
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW, KEY_TAB_COMMAND } from 'lexical';
import { $indentNote, $outdentNote } from '../lexical-helpers';

const editor = useLexicalComposer();

let unregister: (() => void) | undefined;

onMounted(() => {
  unregister = editor.registerCommand(
    KEY_TAB_COMMAND,
    (event: KeyboardEvent) => {
      const selection = $getSelection();

      if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
        return false;
      }

      let anchorNode = selection.anchor.getNode();

      while (anchorNode && !$isListItemNode(anchorNode)) {
        const parent = anchorNode.getParent();
        if (!parent) {
          break;
        }
        anchorNode = parent;
      }

      if (!$isListItemNode(anchorNode)) {
        return false;
      }

      event.preventDefault();

      if (event.shiftKey) {
        $outdentNote(anchorNode);
      } else {
        $indentNote(anchorNode);
      }

      return true;
    },
    COMMAND_PRIORITY_LOW,
  );
});

onBeforeUnmount(() => {
  unregister?.();
});
</script>

<template>
  <slot />
</template>
