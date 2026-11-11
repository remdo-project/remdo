import type { SerializedEditorState, SerializedLexicalNode } from 'lexical';

import { normalizeNoteIdOrThrow } from '#domain/notes/ids';
import { transformSerializedEditorState } from '#client/editor/runtime/serialized-editor-state';

interface NoteLinkSerializedNode extends SerializedLexicalNode {
  type: 'note-link';
  docId?: unknown;
}

export function prepareEditorStateForRuntime(
  persistedState: SerializedEditorState,
  currentDocId: string,
): SerializedEditorState {
  const normalizedDocId = normalizeNoteIdOrThrow(
    currentDocId,
    'prepareEditorStateForRuntime requires a valid current document id.',
  );
  return transformSerializedEditorState(persistedState, (node) => {
    if (node.type !== 'note-link') {
      return node;
    }
    const typedNode = node as NoteLinkSerializedNode;
    if (typedNode.docId === undefined) {
      return {
        ...typedNode,
        docId: normalizedDocId,
      };
    }
    return node;
  });
}
