import type { LexicalEditor } from 'lexical';
import type { NoteId } from '#note-sdk';
import { $resolveFocusNoteKey, $resolveNoteIdFromDOMNode } from '#client/editor/outline/note-context';
import { $findNoteById } from '#client/editor/outline/note-traversal';

/** Bind a row or selection to stable identity; menu semantics live in the SDK. */
export function resolveMenuNoteId(editor: LexicalEditor, rowKey?: string): NoteId | null {
  return editor.read(() => {
    // A caret in a body targets its owning note, so the menu opened from body
    // text acts on that note (docs/specs/outliner/body.md).
    const key = rowKey ?? $resolveFocusNoteKey(editor);
    const element = key ? editor.getElementByKey(key) : null;
    if (!element || !editor.getRootElement()?.contains(element)) return null;
    return $resolveNoteIdFromDOMNode(element);
  });
}

export function resolveMenuNoteElement(editor: LexicalEditor, noteId: NoteId): HTMLElement | null {
  return editor.read(() => {
    const note = $findNoteById(noteId);
    return note ? editor.getElementByKey(note.getKey()) : null;
  });
}
