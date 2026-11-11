import type { SerializedEditorState, SerializedLexicalNode } from 'lexical';

import { normalizeNoteIdOrThrow } from '#domain/notes/ids';
import { transformSerializedEditorState } from '#client/editor/runtime/serialized-editor-state';

interface NoteLinkSerializedNode extends SerializedLexicalNode {
  type: 'note-link';
  docId?: unknown;
}

/** Drops each note link's document ID where it names the current document, as fixtures store links. */
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
