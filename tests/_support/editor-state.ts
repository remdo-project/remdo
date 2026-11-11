import type { SerializedEditorState, SerializedLexicalNode } from 'lexical';

import { normalizeNoteIdOrThrow } from '#domain/notes/ids';
import { transformSerializedEditorState } from '#client/editor/runtime/serialized-editor-state';
import { stripEditorStateDefaults } from '#tools/editor-state-defaults';

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

/**
 * Drops elements' `textFormat` and `textStyle`: the format Lexical gives the next typed text, which
 * selection moves and collaboration sync rewrite and the text format doesn't hold.
 */
export function withoutTypingFormat<T>(state: T): T {
  return transformSerializedEditorState(state as unknown as SerializedEditorState, (node) => Object.fromEntries(
    Object.entries(node).filter(([key]) => key !== 'textFormat' && key !== 'textStyle'),
  ) as unknown as SerializedLexicalNode) as unknown as T;
}

/** A state as a fixture states it: links compacted, defaults and typing format left out. */
export function fixtureComparableState(state: SerializedEditorState, documentId: string): SerializedEditorState {
  return withoutTypingFormat(stripEditorStateDefaults(prepareEditorStateForPersistence(state, documentId)));
}
