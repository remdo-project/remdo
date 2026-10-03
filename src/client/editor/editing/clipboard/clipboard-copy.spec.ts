import { describe, expect, it } from 'vitest';
import { $createLinkNode, $isLinkNode } from '@lexical/link';
import { $createRangeSelection, $createTextNode, $getSelection, $isRangeSelection, $setSelection, PASTE_COMMAND } from 'lexical';
import {
  copySelectionClipboardData, createDataTransfer, meta, placeCaretAtNote, pressKey,
  selectEntireNote, selectNoteTextRange, selectStructuralNotes, typeText,
} from '#tests';
import type { RemdoTestApi } from '#client/editor/dev';
import { $findNoteById } from '#client/editor/outline/note-traversal';
import { $createNoteLinkNode, $isNoteLinkNode } from '#client/editor/features/links/note-link-node';

async function pasteClipboard(remdo: RemdoTestApi, data: DataTransfer) {
  await remdo.dispatchCommand(PASTE_COMMAND, new ClipboardEvent('paste', { clipboardData: data }));
}

function expectCaret(remdo: RemdoTestApi, offset: number) {
  expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });
  remdo.validate(() => {
    const selection = $getSelection();
    expect($isRangeSelection(selection) && selection.isCollapsed() && selection.anchor.offset).toBe(offset);
  });
}

describe('inline clipboard copy (docs/specs/outliner/clipboard.md)', () => {
  for (const flavor of ['internal', 'html'] as const) {
    for (const [text, end, repeated] of [
      ['Alpha', 5, 'AlphaAlpha'],
      ['Alpha ', 6, 'Alpha Alpha '],
      ['Alpha beta', 5, 'AlphaAlpha beta'],
    ] as const) {
      it(`keeps ${JSON.stringify(text.slice(0, end))} inline through replacement and repeated ${flavor} paste`, meta({ fixture: 'flat' }), async ({ remdo }) => {
        await remdo.mutate(() => {
          $findNoteById('note2')!.clear().append($createTextNode(text));
        });
        await selectNoteTextRange(remdo, 'note2', 0, end);
        const copied = await copySelectionClipboardData(remdo);
        expect(copied.getData('text/plain')).toBe(text.slice(0, end));
        const html = document.createElement('div');
        html.innerHTML = copied.getData('text/html');
        expect(html.querySelector('ol, ul, li')).toBeNull();
        const data = flavor === 'internal' ? copied : createDataTransfer();
        if (flavor === 'html') data.setData('text/html', copied.getData('text/html'));

        await pasteClipboard(remdo, data);
        expect(remdo).toMatchOutline([
          { noteId: 'note1', text: 'note1' },
          { noteId: 'note2', text },
          { noteId: 'note3', text: 'note3' },
        ]);
        expectCaret(remdo, end);

        await pasteClipboard(remdo, data);
        expect(remdo).toMatchOutline([
          { noteId: 'note1', text: 'note1' },
          { noteId: 'note2', text: repeated },
          { noteId: 'note3', text: 'note3' },
        ]);
        expectCaret(remdo, end * 2);
      });
    }

    it(`preserves formatting, links and trailing whitespace through ${flavor} copy and repeated paste`, meta({ fixture: 'flat' }), async ({ remdo }) => {
      await placeCaretAtNote(remdo, 'note2');
      await remdo.mutate(() => {
        $findNoteById('note2')!.clear().append(
          $createTextNode('bold ').toggleFormat('bold'),
          $createTextNode('italic ').toggleFormat('italic'),
          $createTextNode('underlined ').toggleFormat('underline'),
          $createTextNode('struck ').toggleFormat('strikethrough'),
          $createTextNode('code ').toggleFormat('code'),
          $createLinkNode('https://example.com/').append($createTextNode('link')),
          $createTextNode(' '),
          $createNoteLinkNode({ docId: remdo.getCollabDocId(), noteId: 'note3' }).append($createTextNode('reference')),
          $createTextNode('  '),
        );
        const texts = $findNoteById('note2')!.getAllTextNodes();
        const selection = $createRangeSelection();
        selection.setTextNodeRange(texts[0]!, 0, texts.at(-1)!, 2);
        $setSelection(selection);
      });
      const copied = await copySelectionClipboardData(remdo);
      const label = 'bold italic underlined struck code link reference  ';
      expect(copied.getData('text/plain')).toBe(label);
      const data = flavor === 'internal' ? copied : createDataTransfer();
      if (flavor === 'html') data.setData('text/html', copied.getData('text/html'));
      for (const repetitions of [1, 2]) {
        await pasteClipboard(remdo, data);
        expect(remdo).toMatchOutline([
          { noteId: 'note1', text: 'note1' },
          { noteId: 'note2', text: label.repeat(repetitions) },
          { noteId: 'note3', text: 'note3' },
        ]);
        expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });
        remdo.validate(() => {
          const note = $findNoteById('note2')!;
          for (const [format, text] of [
            ['bold', 'bold '], ['italic', 'italic '], ['underline', 'underlined '],
            ['strikethrough', 'struck '], ['code', 'code '],
          ] as const) {
            expect(note.getAllTextNodes().filter(node => node.hasFormat(format)).map(node => node.getTextContent()))
              .toEqual(Array.from({ length: repetitions }).fill(text));
          }
          const links = note.getChildren().filter($isLinkNode).filter(node => !$isNoteLinkNode(node));
          const expectedLinks = [['link', 'https://example.com/']];
          if (flavor === 'html') expectedLinks.push(['reference', `/n/${remdo.getCollabDocId()}_note3`]);
          expect(links.map(link => [link.getTextContent(), link.getURL()])).toEqual(
            Array.from({ length: repetitions }).fill(expectedLinks).flat(),
          );
          if (flavor === 'internal') {
            const refs = note.getChildren().filter($isNoteLinkNode);
            expect(refs.map(link => [link.getTextContent(), link.getDocId(), link.getNoteId()])).toEqual(
              Array.from({ length: repetitions }, () => ['reference', remdo.getCollabDocId(), 'note3']),
            );
          }
        });
      }
    });

    it(`preserves a backward partial formatted link selection through ${flavor}`, meta({ fixture: 'flat' }), async ({ remdo }) => {
      await placeCaretAtNote(remdo, 'note2');
      await remdo.mutate(() => {
        const text = $createTextNode('Example').toggleFormat('bold');
        $findNoteById('note2')!.clear().append(
          $createTextNode('before '), $createLinkNode('https://example.com/').append(text), $createTextNode(' after'),
        );
        const selection = $createRangeSelection();
        selection.setTextNodeRange(text, 4, text, 1);
        $setSelection(selection);
      });
      const copied = await copySelectionClipboardData(remdo);
      expect(copied.getData('text/plain')).toBe('xam');
      const data = flavor === 'internal' ? copied : createDataTransfer();
      if (flavor === 'html') data.setData('text/html', copied.getData('text/html'));
      await selectEntireNote(remdo, 'note1');
      for (const text of ['xam', 'xamxam']) {
        await pasteClipboard(remdo, data);
        expect(remdo).toMatchOutline([
          { noteId: 'note1', text },
          { noteId: 'note2', text: 'before Example after' },
          { noteId: 'note3', text: 'note3' },
        ]);
        expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
        remdo.validate(() => {
          const links = $findNoteById('note1')!.getChildren().filter($isLinkNode);
          expect(links.map(link => link.getTextContent()).join('')).toBe(text);
          for (const link of links) {
            expect(link.getURL()).toBe('https://example.com/');
            expect(link.getAllTextNodes().every(node => node.hasFormat('bold'))).toBe(true);
          }
        });
      }
    });

    it(`copies a parent label without its body or children through ${flavor}`, meta({ fixture: 'tree' }), async ({ remdo }) => {
      await placeCaretAtNote(remdo, 'note2', Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Enter', shift: true });
      await typeText(remdo, 'Body');
      await selectEntireNote(remdo, 'note2');
      const copied = await copySelectionClipboardData(remdo);
      expect(copied.getData('text/plain')).toBe('note2');
      const data = flavor === 'internal' ? copied : createDataTransfer();
      if (flavor === 'html') data.setData('text/html', copied.getData('text/html'));
      await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
      await pasteClipboard(remdo, data);
      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'note1note2' },
        { noteId: 'note2', text: 'note2', body: 'Body', children: [{ noteId: 'note3', text: 'note3' }] },
      ]);
    });
  }

  it('keeps an explicit one-note copy structural at a caret', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note2');
    const data = await copySelectionClipboardData(remdo);
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await pasteClipboard(remdo, data);
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: null, text: 'note2' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('keeps an external one-item HTML list structural at a caret', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const data = createDataTransfer();
    data.setData('text/html', '<ul><li>External</li></ul>');
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await pasteClipboard(remdo, data);
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: null, text: 'External' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });
});
