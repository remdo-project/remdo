import { $getRoot } from 'lexical';
import type { LexicalEditor } from 'lexical';
import type { NoteId, OpenDocument } from '#note-sdk';
import { createLexicalOpenDocumentRuntime } from '#client/editor/note-sdk-adapters/lexical-open-document';
import { $normalizeOutlineRoot, $shouldNormalizeOutlineRoot } from '#client/editor/outline/normalization';
import { $isBlankRoot } from '#client/editor/outline/schema';
import { $normalizeNoteIdsOnLoad } from '#client/editor/runtime/note-ids/note-id-normalization';
import { withHeadlessEditor } from './headless-editor';

// The same load-time normalization the browser editor applies, so an empty or
// legacy document exposes at least one addressable note. A read-only open keeps
// it in memory, so it leaves an empty document empty and reports the noteIds it
// generated, which are never stored.
function normalizeLoadedDocument(editor: LexicalEditor, docId: string, readOnly: boolean): ReadonlySet<NoteId> {
  let generated: ReadonlySet<NoteId> = new Set();
  editor.update(() => {
    const root = $getRoot();
    if (readOnly && $isBlankRoot()) return;
    if ($shouldNormalizeOutlineRoot(root)) $normalizeOutlineRoot(root);
    generated = $normalizeNoteIdsOnLoad(root, docId);
  }, { discrete: true });
  return readOnly ? generated : new Set();
}

/**
 * Open a document as the credential's user and run `run` against its note API.
 * `unstoredNoteIds` lists notes a read-only open can read but not address.
 */
export function withHeadlessOpenDocument<T>(
  docId: string,
  authorization: string,
  run: (openDocument: OpenDocument, unstoredNoteIds: ReadonlySet<NoteId>) => Promise<T>,
  { readOnly = false }: { readOnly?: boolean } = {},
): Promise<T> {
  return withHeadlessEditor(docId, async (editor) => {
    const unstoredNoteIds = normalizeLoadedDocument(editor, docId, readOnly);
    const runtime = createLexicalOpenDocumentRuntime({ editor, docId });
    runtime.start();
    runtime.setSourceReady(true);
    try {
      return await run(runtime.openDocument, unstoredNoteIds);
    } finally {
      runtime.dispose();
    }
  }, { authorization, readOnly });
}
