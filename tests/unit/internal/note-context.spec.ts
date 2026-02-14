import { describe, expect, it } from 'vitest';

import {
  $resolveContentNoteFromDOMNode,
  $resolveNoteIdFromDOMNode,
  $resolveNoteIdFromNode,
} from '@/editor/outline/note-context';
import { resolveContentItemFromNode } from '@/editor/outline/schema';
import { $findNoteById } from '@/editor/outline/note-traversal';
import { getNoteElement, getNoteTextNode, meta } from '#tests';

describe('note context helpers', () => {
  it('resolves content note and noteId from lexical nodes', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const resolved = remdo.validate(() => {
      const note = $findNoteById('note2')!;
      const textNode = note.getFirstChild()!;
      return {
        noteKey: note.getKey(),
        contentKey: resolveContentItemFromNode(textNode)!.getKey(),
        noteId: $resolveNoteIdFromNode(textNode),
      };
    });

    expect(resolved.contentKey).toBe(resolved.noteKey);
    expect(resolved.noteId).toBe('note2');
  });

  it('resolves content note and noteId from DOM nodes', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const noteElement = getNoteElement(remdo, 'note3');
    const noteTextNode = getNoteTextNode(remdo, 'note3');

    const resolved = remdo.editor.read(() => {
      return {
        elementKey: $resolveContentNoteFromDOMNode(noteElement)!.getKey(),
        textKey: $resolveContentNoteFromDOMNode(noteTextNode)!.getKey(),
        noteIdFromElement: $resolveNoteIdFromDOMNode(noteElement),
        noteIdFromText: $resolveNoteIdFromDOMNode(noteTextNode),
      };
    });

    expect(resolved.elementKey).toBe(resolved.textKey);
    expect(resolved.noteIdFromElement).toBe('note3');
    expect(resolved.noteIdFromText).toBe('note3');
  });

  it('returns null for nodes outside the outline', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const outsideNode = document.createElement('div');

    const resolved = remdo.editor.read(() => {
      return {
        contentFromDOM: $resolveContentNoteFromDOMNode(outsideNode),
        noteIdFromDOM: $resolveNoteIdFromDOMNode(outsideNode),
        contentFromNullLexical: resolveContentItemFromNode(null),
        noteIdFromNullLexical: $resolveNoteIdFromNode(null),
      };
    });

    expect(resolved.contentFromDOM).toBeNull();
    expect(resolved.noteIdFromDOM).toBeNull();
    expect(resolved.contentFromNullLexical).toBeNull();
    expect(resolved.noteIdFromNullLexical).toBeNull();
  });
});
