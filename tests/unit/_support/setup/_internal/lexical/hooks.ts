import type { LexicalEditor } from 'lexical';
import { defineComponent, h, onMounted } from 'vue';
import { render, waitFor } from '@testing-library/vue';
import { beforeEach } from 'vitest';
import EditorRoot from '@/editor/EditorRoot.vue';
import { useLexicalComposer } from 'lexical-vue/LexicalComposer';
import { createLexicalTestHelpers } from './state';
import { useCollaborationStatus } from '@/editor/plugins/collaboration';
import type { CollaborationStatusValue } from '@/editor/plugins/collaboration';

const Bridge = defineComponent({
  name: 'LexicalBridge',
  props: {
    onReady: {
      type: Function,
      required: true,
    },
  },
  render: () => null,
  setup(props) {
    const editor = useLexicalComposer();
    const collabStatus = useCollaborationStatus();

    onMounted(() => {
      (props.onReady as (payload: {
        editor: LexicalEditor;
        getCollabStatus: () => CollaborationStatusValue | null;
      }) => void)({
        editor,
        getCollabStatus: () => collabStatus,
      });
    });
  },
});

const LexicalHarness = defineComponent({
  name: 'LexicalHarness',
  props: {
    onReady: {
      type: Function,
      required: true,
    },
  },
  setup(props) {
    return () =>
      h(EditorRoot, null, {
        default: () => h(Bridge, { onReady: props.onReady }),
      });
  },
});

beforeEach(async (ctx) => {
  let editor: LexicalEditor | null = null;
  let getCollabStatus: (() => CollaborationStatusValue | null) | null = null;

  render(LexicalHarness, {
    props: {
      onReady: ({ editor: instance, getCollabStatus: statusGetter }: {
        editor: LexicalEditor;
        getCollabStatus: () => CollaborationStatusValue | null;
      }) => {
        editor = instance;
        getCollabStatus = statusGetter;
      },
    },
  });

  await waitFor(() => {
    if (!editor || !getCollabStatus) {
      throw new Error('Lexical editor not initialized in time');
    }
  });

  ctx.lexical = createLexicalTestHelpers(editor!, getCollabStatus!);
});
