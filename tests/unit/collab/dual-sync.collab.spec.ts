import { env } from '#config/env-client';
import { $createListItemNode, $createListNode } from '@lexical/list';
import { render, waitFor } from '@testing-library/vue';
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical';
import type { LexicalEditor } from 'lexical';
import { defineComponent, h, onMounted } from 'vue';
import type { PropType } from 'vue';
import { describe, expect, it } from 'vitest';
import Editor from '@/editor/Editor.vue';
import { useCollaborationStatus } from '@/editor/plugins/collaboration';
import { useLexicalComposer } from 'lexical-vue/LexicalComposer';

interface PeerHandle {
  editor: LexicalEditor;
  waitForSync: () => Promise<void>;
  hasUnsyncedChanges: () => boolean;
}

const CollaborationPeer = defineComponent({
  name: 'CollaborationPeer',
  props: {
    onReady: {
      type: Function as PropType<(handle: PeerHandle) => void>,
      required: true,
    },
  },
  setup(props) {
    const editor = useLexicalComposer();
    const collab = useCollaborationStatus();

    onMounted(() => {
      props.onReady({
        editor,
        waitForSync: () => collab.waitForSync(),
        hasUnsyncedChanges: () => collab.hasUnsyncedChanges.value,
      });
    });

    return () => null;
  },
});

const SecondaryEditor = defineComponent({
  name: 'SecondaryEditor',
  props: {
    onReady: {
      type: Function as PropType<(handle: PeerHandle) => void>,
      required: true,
    },
  },
  setup(props) {
    return () =>
      h(Editor, null, {
        default: () => h(CollaborationPeer, { onReady: props.onReady }),
      });
  },
});

describe.skipIf(!env.collabEnabled)('collaboration sync', () => {
  it('syncs edits between editors', async ({ lexical }) => {
    let secondary!: PeerHandle;

    render(SecondaryEditor, {
      props: {
        onReady: (handle: PeerHandle) => {
          secondary = handle;
        },
      },
    });

    await waitFor(() => {
      if (!secondary) throw new Error('Secondary editor not ready');
    });

    await Promise.all([lexical.waitForCollabSync(), secondary.waitForSync()]);

    const readText = (editor: LexicalEditor) =>
      editor.getEditorState().read(() => $getRoot().getTextContent().trim());

    lexical.editor.update(() => {
      $getRoot().clear();
    });

    await Promise.all([lexical.waitForCollabSync(), secondary.waitForSync()]);

    expect(readText(lexical.editor)).toBe('');
    expect(readText(secondary.editor)).toBe('');
    expect(lexical.hasCollabUnsyncedChanges()).toBe(false);
    expect(secondary.hasUnsyncedChanges()).toBe(false);

    lexical.editor.update(() => {
      const root = $getRoot();
      root.clear();

      const list = $createListNode('bullet');
      const item = $createListItemNode();
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode('shared note'));
      item.append(paragraph);
      list.append(item);
      root.append(list);
    });

    await Promise.all([lexical.waitForCollabSync(), secondary.waitForSync()]);

    expect(lexical.hasCollabUnsyncedChanges()).toBe(false);
    expect(secondary.hasUnsyncedChanges()).toBe(false);
    expect(readText(lexical.editor)).toBe('shared note');
    expect(readText(secondary.editor)).toBe('shared note');
  });
});
