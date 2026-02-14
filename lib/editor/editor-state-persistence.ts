import type { SerializedEditorState, SerializedLexicalNode } from 'lexical';

import { normalizeNoteIdOrThrow } from '#lib/editor/note-ids';
import { transformSerializedEditorState } from '#lib/editor/serialized-editor-state';

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

export function prepareEditorStateForPersistence(
  runtimeState: SerializedEditorState,
  currentDocId: string,
): SerializedEditorState {
  const normalizedDocId = normalizeNoteIdOrThrow(
    currentDocId,
    'prepareEditorStateForPersistence requires a valid current document id.',
  );
  return transformSerializedEditorState(runtimeState, (node) => {
    if (node.type !== 'note-link') {
      return node;
    }
    const typedNode = node as NoteLinkSerializedNode;
    if (typedNode.docId === normalizedDocId) {
      const withoutDocId = { ...typedNode };
      delete withoutDocId.docId;
      return withoutDocId;
    }
    return node;
  });
}
