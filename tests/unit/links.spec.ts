import { $isLinkNode } from '@lexical/link';
import { describe, expect, it } from 'vitest';

import { parseInternalNoteLinkUrl } from '@/editor/links/internal-link-url';
import { $findNoteById } from '@/editor/outline/note-traversal';
import { meta, placeCaretAtNote, pressKey, typeText } from '#tests';

describe('note links (docs/outliner/links.md)', () => {
  it('inserts a link with Enter and keeps stable note identity in URL', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, '@note2');
    await pressKey(remdo, { key: 'Enter' });

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1note2 ' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const linkNode = note.getChildren().find($isLinkNode)!;
      expect(linkNode.getTextContent()).toBe('note2');
      expect(parseInternalNoteLinkUrl(linkNode.getURL())).toBe('note2');
      expect(note.getTextContent().endsWith(' ')).toBe(true);
    });
  });

  it('confirms the active option with Tab', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, '@note3');
    await pressKey(remdo, { key: 'Tab' });

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1note3 ' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('removes @query token on Escape', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, '@note2');
    await pressKey(remdo, { key: 'Escape' });

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('keeps @ as plain text on Backspace when query is empty', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, '@');
    await pressKey(remdo, { key: 'Backspace' });

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1@' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });
});
