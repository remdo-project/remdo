import type { ListItemNode } from '@lexical/list';
import type { RootNode } from 'lexical';
import { $getState, $setState, createState } from 'lexical';
import { normalizeNoteId } from '#domain/notes/ids';
import { patchListItemStateConfig } from '#client/editor/runtime/list-item-state-config';

// Whether a note's noteId is also written in its document's text as its `id::` property.
const textIdState = createState('textId', {
  parse: (value) => (value === true ? true : undefined),
});

// A document's `id::` property, which has no list item to carry it.
const documentTextIdState = createState('documentTextId', {
  parse: (value) => normalizeNoteId(value) ?? undefined,
});

export function $hasTextId(node: ListItemNode): boolean {
  return $getState(node, textIdState) === true;
}

export function $setHasTextId(node: ListItemNode, value: boolean): void {
  $setState(node, textIdState, value ? true : undefined);
}

export function $getDocumentTextId(root: RootNode): string | null {
  return $getState(root, documentTextIdState) ?? null;
}

export function $setDocumentTextId(root: RootNode, id: string | null): void {
  $setState(root, documentTextIdState, id ?? undefined);
}

let didPatch = false;

export function ensureTextIdStateConfig(): void {
  if (didPatch) {
    return;
  }
  didPatch = true;
  patchListItemStateConfig(textIdState);
}
