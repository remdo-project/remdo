import { describe, expect, it } from 'vitest';
import { $getRoot, PASTE_COMMAND } from 'lexical';
import { createDataTransfer, meta, placeCaretAtNote, pressKey, readCaretNoteId, readOutline, selectEntireNote } from '#tests';
import type { RemdoTestApi } from '#client/editor/dev';

async function paste(remdo: RemdoTestApi, flavor: string, content: string) {
  const data = createDataTransfer();
  data.setData(flavor, content);
  await remdo.dispatchCommand(PASTE_COMMAND, new ClipboardEvent('paste', { clipboardData: data }));
}

describe('clipboard input conversion', () => {
  for (const [name, flavor, content, lines] of [
    ['HTML paragraphs', 'text/html', '<p><b>Alpha</b></p><p><a href="https://example.com">Beta</a></p>', ['Alpha', 'Beta']],
    ['HTML line break', 'text/html', '<p><b>Alpha</b><br>Beta</p>', ['Alpha', 'Beta']],
    ['multiline list label', 'text/html', '<ul><li>Alpha<br>Beta<ul><li>Child</li></ul></li></ul>', ['Alpha', 'Beta', 'Child']],
    ['HTML table', 'text/html', '<table><tr><td>Alpha</td><td>Beta</td></tr></table>', ['Alpha', 'Beta']],
    ['carriage return', 'text/plain', 'Alpha\rBeta', ['Alpha', 'Beta']],
    ['CRLF', 'text/plain', 'Alpha\r\nBeta', ['Alpha', 'Beta']],
  ] as const) {
    it(`inserts ${name} as plain notes with normal middle placement`, meta({ fixture: 'tree' }), async ({ remdo }) => {
      await placeCaretAtNote(remdo, 'note2', 2);
      await paste(remdo, flavor, content);

      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'note1' },
        { noteId: 'note2', text: 'no' },
        ...lines.map(text => ({ noteId: null, text })),
        { noteId: null, text: 'te2', children: [{ noteId: 'note3', text: 'note3' }] },
      ]);
      const outline = readOutline(remdo);
      expect(readCaretNoteId(remdo)).toBe(outline.at(-2)!.noteId);
      remdo.validate(() => {
        expect($getRoot().getAllTextNodes().every(node => node.getFormat() === 0)).toBe(true);
      });
      expect(remdo.editor.getRootElement()!.querySelector('a')).toBeNull();
    });
  }

  it('uses inline-selection placement for converted HTML', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note2');
    await paste(remdo, 'text/html', '<p>Alpha<br>Beta</p>');
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'Alpha', children: [
        { noteId: null, text: 'Beta' },
        { noteId: 'note3', text: 'note3' },
      ] },
    ]);
  });

  it('keeps single-line rich content inline', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', 2);
    await paste(remdo, 'text/html', '<p><b>Alpha</b> <a href="https://example.com">Beta</a></p>');
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'noAlpha Betate2', children: [{ noteId: 'note3', text: 'note3' }] },
    ]);
    expect(remdo.editor.getRootElement()!.querySelector('a')!.getAttribute('href')).toBe('https://example.com');
    remdo.validate(() => {
      expect($getRoot().getAllTextNodes().find(node => node.getTextContent() === 'Alpha')!.hasFormat('bold')).toBe(true);
    });
  });

  it('keeps rich line breaks inside a body', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'Enter', shift: true });
    await paste(remdo, 'text/html', '<p><b>Alpha</b><br>Beta</p>');
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2', body: 'Alpha\nBeta', children: [{ noteId: 'note3', text: 'note3' }] },
    ]);
    remdo.validate(() => {
      expect($getRoot().getAllTextNodes().find(node => node.getTextContent() === 'Alpha')!.hasFormat('bold')).toBe(true);
    });
  });
});
