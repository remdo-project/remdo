import { $isListItemNode } from '@lexical/list';
import { $getRoot, $isElementNode } from 'lexical';
import type { LexicalEditor, LexicalNode } from 'lexical';
import type { NoteId, OpenDocument } from '#note-sdk';
import { createLexicalOpenDocumentRuntime } from '#client/editor/note-sdk-adapters/lexical-open-document';
import { $normalizeOutlineRoot, $shouldNormalizeOutlineRoot } from '#client/editor/outline/normalization';
import { $normalizeNoteIdsOnLoad } from '#client/editor/runtime/note-ids/note-id-normalization';
import { $getNoteId } from '#client/editor/runtime/note-ids/note-id-state';
import { withHeadlessEditor } from './headless-editor';

function $collectNoteIds(): Set<NoteId> {
  const noteIds = new Set<NoteId>();
  const pending: LexicalNode[] = [$getRoot()];
  for (let node = pending.pop(); node; node = pending.pop()) {
    const noteId = $isListItemNode(node) ? $getNoteId(node) : null;
    if (noteId) noteIds.add(noteId);
    if ($isElementNode(node)) {
      for (const child of node.getChildren()) pending.push(child);
    }
  }
  return noteIds;
}

// The same load-time normalization the browser editor applies, so an empty or
// legacy document exposes at least one addressable note. A read-only open keeps
// it in memory, so only the noteIds present before it are stored.
function normalizeLoadedDocument(editor: LexicalEditor, docId: string, readOnly: boolean): (noteId: NoteId) => boolean {
  let storedNoteIds: ReadonlySet<NoteId> | null = null;
  editor.update(() => {
    const root = $getRoot();
    if (readOnly) storedNoteIds = $collectNoteIds();
    if ($shouldNormalizeOutlineRoot(root)) $normalizeOutlineRoot(root);
    $normalizeNoteIdsOnLoad(root, docId);
  }, { discrete: true });
  return (noteId) => storedNoteIds?.has(noteId) ?? true;
}

/**
 * Open a document as the credential's user and run `run` against its note API.
 * `isStored` tells whether a note's address persists beyond a read-only open.
 */
export function withHeadlessOpenDocument<T>(
  docId: string,
  authorization: string,
  run: (openDocument: OpenDocument, isStored: (noteId: NoteId) => boolean) => Promise<T>,
  { readOnly = false, signal }: { readOnly?: boolean; signal?: AbortSignal } = {},
): Promise<T> {
  return withHeadlessEditor(docId, async (editor) => {
    const isStored = normalizeLoadedDocument(editor, docId, readOnly);
    const runtime = createLexicalOpenDocumentRuntime({ editor, docId });
    runtime.start();
    runtime.setSourceReady(true);
    try {
      return await run(runtime.openDocument, isStored);
    } finally {
      runtime.dispose();
    }
  }, { authorization, readOnly, signal });
}
