import { describe, expect, it } from 'vitest';
import { $getRoot, PASTE_COMMAND } from 'lexical';
import {
  copySelection, createDataTransfer, meta, pastePayload, placeCaretAtNote, pressKey,
  readCaretNoteId, readOutline, selectEntireNote, selectStructuralNotes, typeText,
} from '#tests';
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
    ['paragraphs inside a list item', 'text/html', '<ul><li><p>Alpha</p><p>Beta</p></li></ul>', ['Alpha', 'Beta']],
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

  it('keeps a copied note with a multiline body and children intact', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'one');
    await pressKey(remdo, { key: 'Enter' });
    await typeText(remdo, 'two');
    await selectStructuralNotes(remdo, 'note2', 'note3');
    const payload = await copySelection(remdo);
    await placeCaretAtNote(remdo, 'note1', 0);
    await pastePayload(remdo, payload);

    expect(remdo).toMatchOutline([
      { noteId: null, text: 'note2', body: 'one\ntwo', children: [{ noteId: null, text: 'note3' }] },
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2', body: 'one\ntwo', children: [{ noteId: 'note3', text: 'note3' }] },
    ]);
  });

  it('keeps well-formed HTML list hierarchy', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', 0);
    await paste(remdo, 'text/html', '<ul><li>Alpha<ul><li>Child</li></ul></li><li>Beta</li></ul>');
    expect(remdo).toMatchOutline([
      { noteId: null, text: 'Alpha', children: [{ noteId: null, text: 'Child' }] },
      { noteId: null, text: 'Beta' },
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3' }] },
    ]);
  });

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
