import { $getRoot } from 'lexical';
import type { LexicalEditor } from 'lexical';
import type { OpenDocument } from '#note-sdk';
import { createLexicalOpenDocumentRuntime } from '#client/editor/note-sdk-adapters/lexical-open-document';
import { $normalizeOutlineRoot, $shouldNormalizeOutlineRoot } from '#client/editor/outline/normalization';
import { $normalizeNoteIdsOnLoad } from '#client/editor/runtime/note-ids/note-id-normalization';
import { withHeadlessEditor } from './headless-editor';

// The same load-time normalization the browser editor applies, so an empty or
// legacy document exposes at least one addressable note.
function normalizeLoadedDocument(editor: LexicalEditor, docId: string): void {
  editor.update(() => {
    const root = $getRoot();
    if ($shouldNormalizeOutlineRoot(root)) $normalizeOutlineRoot(root);
    $normalizeNoteIdsOnLoad(root, docId);
  }, { discrete: true });
}

/** Open a document as the credential's user and run `run` against its note API. */
export function withHeadlessOpenDocument<T>(
  docId: string,
  authorization: string,
  run: (openDocument: OpenDocument) => Promise<T>,
): Promise<T> {
  return withHeadlessEditor(docId, async (editor) => {
    normalizeLoadedDocument(editor, docId);
    const runtime = createLexicalOpenDocumentRuntime({ editor, docId });
    runtime.start();
    runtime.setSourceReady(true);
    try {
      return await run(runtime.openDocument);
    } finally {
      runtime.dispose();
    }
  }, { authorization });
}
