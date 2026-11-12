import type { SerializedEditorState } from 'lexical';

import { normalizeNoteIdOrThrow } from '#domain/notes/ids';
import type { SerializedNoteLinkNode } from '#client/editor/features/links/note-link-node';
import { transformSerializedEditorState } from '#client/editor/runtime/serialized-editor-state';

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
    const typedNode = node as SerializedNoteLinkNode;
    if (typedNode.docId === undefined) {
      return {
        ...typedNode,
        docId: normalizedDocId,
      };
    }
    return node;
  });
}
