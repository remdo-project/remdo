import type { LexicalEditor } from 'lexical';
import type { PropType } from 'vue';
import { defineComponent, h, onMounted } from 'vue';
import { render, waitFor } from '@testing-library/vue';
import { beforeEach, afterEach } from 'vitest';
import type { TestContext } from 'vitest';
import Editor from '@/editor/Editor.vue';
import type { CollaborationStatusValue } from '@/editor/plugins/collaboration';
import { useCollaborationStatus } from '@/editor/plugins/collaboration';
import { useLexicalComposer } from 'lexical-vue/LexicalComposer';
import { createLexicalTestHelpers } from './state';

interface BridgePayload {
  editor: LexicalEditor;
  collab: CollaborationStatusValue;
}

const Bridge = defineComponent({
  name: 'LexicalBridge',
  props: {
    onReady: {
      type: Function as PropType<(payload: BridgePayload) => void>,
      required: true,
    },
  },
  setup(props) {
    const editor = useLexicalComposer();
    const collab = useCollaborationStatus();

    onMounted(() => {
      props.onReady({ editor, collab });
    });

    return () => null;
  },
});

const LexicalHarness = defineComponent({
  name: 'LexicalHarness',
  props: {
    onReady: {
      type: Function as PropType<(payload: BridgePayload) => void>,
      required: true,
    },
  },
  setup(props) {
    return () =>
      h(
        Editor,
        null,
        {
          default: () => h(Bridge, { onReady: props.onReady }),
        }
      );
  },
});

beforeEach<TestContext>(async (ctx) => {
  let editor!: LexicalEditor;
  let collab!: CollaborationStatusValue;

  render(LexicalHarness, {
    props: {
      onReady: ({ editor: instance, collab: status }) => {
        editor = instance;
        collab = status;
      },
    },
  });

  await waitFor(() => {
    if (!editor || !collab) throw new Error('Lexical editor not initialized in time');
  });

  ctx.lexical = createLexicalTestHelpers(editor, () => collab);
});

afterEach(async ({ lexical }) => {
  await lexical.waitForCollabSync();
});
