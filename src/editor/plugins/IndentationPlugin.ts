import { $isListItemNode } from '@lexical/list';
import { useLexicalComposer } from 'lexical-vue/LexicalComposer';
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW, KEY_TAB_COMMAND } from 'lexical';
import { defineComponent, onMounted, onUnmounted } from 'vue';
import { $indentNote, $outdentNote } from '../lexical-helpers';

export const IndentationPlugin = defineComponent({
  name: 'IndentationPlugin',
  setup() {
    const editor = useLexicalComposer();

    onMounted(() => {
      const unregister = editor.registerCommand(
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

          const listItem = anchorNode;
          event.preventDefault();

          if (event.shiftKey) {
            $outdentNote(listItem);
          } else {
            $indentNote(listItem);
          }

          return true;
        },
        COMMAND_PRIORITY_LOW
      );

      onUnmounted(unregister);
    });

    return () => null;
  },
});
