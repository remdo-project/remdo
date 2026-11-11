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
 * Drops elements' `textFormat` and `textStyle`: the format Lexical's selection handling gives the next
 * typed text. Selection moves and collaboration sync rewrite them, RemDo's code never sets them, and the
 * text format doesn't hold them.
 */
export function withoutTypingFormat(state: SerializedEditorState): SerializedEditorState {
  return transformSerializedEditorState(state, (node) => Object.fromEntries(
    Object.entries(node).filter(([key]) => key !== 'textFormat' && key !== 'textStyle'),
  ) as SerializedLexicalNode);
}

export function fixtureComparableState(state: SerializedEditorState, documentId: string): SerializedEditorState {
  return withoutTypingFormat(stripEditorStateDefaults(prepareEditorStateForPersistence(state, documentId)));
}
