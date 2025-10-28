import { env } from '#config/env-client';
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical';
import type { LexicalEditor } from 'lexical';
import { $createListItemNode, $createListNode } from '@lexical/list';
import { defineComponent, h, onMounted } from 'vue';
import { describe, expect, it } from 'vitest';
import { render, waitFor } from '@testing-library/vue';
import EditorRoot from '@/editor/EditorRoot.vue';
import { useLexicalComposer } from 'lexical-vue/LexicalComposer';
import { useCollaborationStatus } from '@/editor/plugins/collaboration';

interface PeerHandle {
  editor: LexicalEditor;
  waitForSync: () => Promise<void>;
  hasUnsyncedChanges: () => boolean;
}

const CollaborationPeer = defineComponent({
  name: 'CollaborationPeer',
  emits: ['ready'],
  setup(_, { emit }) {
    const editor = useLexicalComposer();
    const status = useCollaborationStatus();

    onMounted(() => {
      emit('ready', {
        editor,
        waitForSync: () => status.waitForSync(),
        hasUnsyncedChanges: () => status.hasUnsyncedChanges,
      } satisfies PeerHandle);
    });

    return () => null;
  },
});

describe.skipIf(!env.collabEnabled)('collaboration sync', () => {
  it('syncs edits between editors', async ({ lexical }) => {
    let secondary: PeerHandle | null = null;

    const Harness = defineComponent({
      setup() {
        return () =>
          h(EditorRoot, null, {
            default: () =>
              h(CollaborationPeer, {
                onReady: (handle: PeerHandle) => {
                  secondary = handle;
                },
              }),
          });
      },
    });

    render(Harness);

    await waitFor(() => {
      if (!secondary) throw new Error('Secondary editor not ready');
    });

    await Promise.all([lexical.waitForCollabSync(), secondary!.waitForSync()]);

    const readText = (editor: LexicalEditor) =>
      editor.getEditorState().read(() => $getRoot().getTextContent().trim());

    lexical.editor.update(() => {
      $getRoot().clear();
    });

    await Promise.all([lexical.waitForCollabSync(), secondary!.waitForSync()]);

    expect(readText(lexical.editor)).toBe('');
    expect(readText(secondary!.editor)).toBe('');
    expect(lexical.hasCollabUnsyncedChanges()).toBe(false);
    expect(secondary!.hasUnsyncedChanges()).toBe(false);

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

    await Promise.all([lexical.waitForCollabSync(), secondary!.waitForSync()]);

    expect(lexical.hasCollabUnsyncedChanges()).toBe(false);
    expect(secondary!.hasUnsyncedChanges()).toBe(false);
    expect(readText(lexical.editor)).toBe('shared note');
    expect(readText(secondary!.editor)).toBe('shared note');
  });
});
