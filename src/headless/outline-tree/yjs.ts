import type { Provider } from '@lexical/yjs';
import {
  createBindingV2__EXPERIMENTAL,
  syncLexicalUpdateToYjsV2__EXPERIMENTAL,
  syncYjsStateToLexicalV2__EXPERIMENTAL,
} from '@lexical/yjs';
import { createEditor } from 'lexical';
import type { LexicalEditor } from 'lexical';
import { encodeStateAsUpdate } from 'yjs';
import type { Doc } from 'yjs';
import { editorConfig } from '#client/editor/runtime/config';
import { $applyTree } from './apply';
import { $readTree } from './read';
import type { Document } from './tree';

// Conversions run on a short-lived editor with no peers, so nothing reads or draws cursors.
const noPeers: Provider = {
  awareness: {
    getLocalState: () => null,
    getStates: () => new Map(),
    off: () => {},
    on: () => {},
    setLocalState: () => {},
    setLocalStateField: () => {},
  },
  connect: () => {},
  disconnect: () => {},
  off: () => {},
  on: () => {},
};

function withEditor<T>(doc: Doc, run: (editor: LexicalEditor, binding: ReturnType<typeof createBindingV2__EXPERIMENTAL>) => T): T {
  const editor = createEditor(editorConfig);
  const binding = createBindingV2__EXPERIMENTAL(editor, 'outline-tree', doc, new Map([['outline-tree', doc]]));
  syncYjsStateToLexicalV2__EXPERIMENTAL(binding, noPeers);
  editor.update(() => {}, { discrete: true });
  return run(editor, binding);
}

/** The tree of a document's current Yjs state. */
export function readTree(doc: Doc): Document {
  return withEditor(doc, (editor) => editor.getEditorState().read($readTree));
}

/** The tree of a document's current Yjs state, with that state. */
export function saveTree(doc: Doc): { tree: Document; state: Uint8Array } {
  return { tree: readTree(doc), state: encodeStateAsUpdate(doc) };
}

/** Change a document's Yjs state to hold `tree`. */
export function applyTree(doc: Doc, tree: Document): void {
  withEditor(doc, (editor, binding) => {
    const unregister = editor.registerUpdateListener(({ prevEditorState, editorState, dirtyElements, dirtyLeaves, normalizedNodes, tags }) => {
      syncLexicalUpdateToYjsV2__EXPERIMENTAL(
        binding, noPeers, prevEditorState, editorState, dirtyElements, dirtyLeaves, normalizedNodes, tags,
      );
    });
    try {
      editor.update(() => $applyTree(tree), { discrete: true });
    } finally {
      unregister();
    }
  });
}
