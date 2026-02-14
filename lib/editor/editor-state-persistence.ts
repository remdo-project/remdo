import type { SerializedEditorState, SerializedLexicalNode } from 'lexical';

import { normalizeNoteIdOrThrow } from '#lib/editor/note-ids';

interface NoteLinkSerializedNode extends SerializedLexicalNode {
  type: 'note-link';
  docId?: unknown;
}

function forEachSerializedNode(state: SerializedEditorState, visit: (node: SerializedLexicalNode) => void): void {
  const stack: SerializedLexicalNode[] = [state.root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }
    visit(node);

    const maybeChildren = (node as { children?: unknown }).children;
    if (!Array.isArray(maybeChildren)) {
      continue;
    }
    for (let i = maybeChildren.length - 1; i >= 0; i -= 1) {
      const child = maybeChildren[i];
      if (child && typeof child === 'object') {
        stack.push(child as SerializedLexicalNode);
      }
    }
  }
}

export function prepareEditorStateForRuntime(
  persistedState: SerializedEditorState,
  currentDocId: string,
): SerializedEditorState {
  const normalizedDocId = normalizeNoteIdOrThrow(
    currentDocId,
    'prepareEditorStateForRuntime requires a valid current document id.',
  );
  const runtimeState = structuredClone(persistedState);
  forEachSerializedNode(runtimeState, (node) => {
    if (node.type !== 'note-link') {
      return;
    }
    const typedNode = node as NoteLinkSerializedNode;
    if (typedNode.docId === undefined) {
      typedNode.docId = normalizedDocId;
    }
  });
  return runtimeState;
}

export function prepareEditorStateForPersistence(
  runtimeState: SerializedEditorState,
  currentDocId: string,
): SerializedEditorState {
  const normalizedDocId = normalizeNoteIdOrThrow(
    currentDocId,
    'prepareEditorStateForPersistence requires a valid current document id.',
  );
  const persistedState = structuredClone(runtimeState);
  forEachSerializedNode(persistedState, (node) => {
    if (node.type !== 'note-link') {
      return;
    }
    const typedNode = node as NoteLinkSerializedNode;
    if (typedNode.docId === normalizedDocId) {
      delete typedNode.docId;
    }
  });
  return persistedState;
}
