import { describe, expect, it } from 'vitest';
import { $getRoot, $getSelection, $isRangeSelection, $isTextNode, PASTE_COMMAND } from 'lexical';
import {
  copySelection, createDataTransfer, meta, pastePayload, placeCaretAtNote, pressKey,
  readCaretNoteId, readOutline, selectEntireNote, selectStructuralNotes, typeText,
} from '#tests';
import type { RemdoTestApi } from '#client/editor/dev';
import { $findNoteById } from '#client/editor/outline/note-traversal';
import { getNoteBody } from '#client/editor/outline/selection/body-region';
import { $isNoteLinkNode } from '#client/editor/features/links/note-link-node';

async function pasteHtml(remdo: RemdoTestApi, html: string, plain: string) {
  const data = createDataTransfer();
  data.setData('text/html', html);
  data.setData('text/plain', plain);
  await remdo.dispatchCommand(PASTE_COMMAND, new ClipboardEvent('paste', { clipboardData: data }));
}

describe('rich clipboard input', () => {
  it('keeps owned note URL identity when HTML accompanies plain text', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    const url = new URL(`/n/${remdo.getCollabDocId()}_note2`, globalThis.location.href).toString();
    await pasteHtml(remdo, `<a href="${url}">${url}</a>`, url);
    remdo.validate(() => {
      const link = $findNoteById('note1')!.getChildren().find($isNoteLinkNode)!;
      expect(link.getDocId()).toBe(remdo.getCollabDocId());
      expect(link.getNoteId()).toBe('note2');
      expect(link.getTextContent()).toBe('note2');
    });
  });

  for (const [name, html] of [
    ['source whitespace', '<p><b>Alpha\nBeta</b></p>'],
    ['hard break', '<p><b>Alpha<br>Beta</b></p>'],
    ['preformatted text', '<pre>Alpha\nBeta</pre>'],
    ['preserved whitespace', '<div style="white-space: pre-wrap">Alpha\nBeta</div>'],
  ] as const) {
    it(`joins ${name} inside a rich label and prefers HTML over plain text`, meta({ fixture: 'tree' }), async ({ remdo }) => {
      await placeCaretAtNote(remdo, 'note2', 2);
      await pasteHtml(remdo, html, 'Alpha\nBeta');
      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'note1' },
        { noteId: 'note2', text: 'noAlpha Betate2', children: [{ noteId: 'note3', text: 'note3' }] },
      ]);
    });

  }

  it('keeps bare text beside an HTML block when no plain-text flavor is supplied', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', 0);
    await pasteHtml(remdo, 'Before<p>After<br></p>', '');
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: null, text: 'Before' },
      { noteId: null, text: 'After' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('retains mixed blocks, hierarchy, formatting and links through middle placement', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', 2);
    await pasteHtml(remdo,
      '<p>Before</p><ul><li><b>Alpha</b><br>Beta<ul><li>Child</li></ul></li></ul><p><a href="https://example.com">After</a></p>',
      'Before\nAlpha\nBeta\nChild\nAfter');
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'no' },
      { noteId: null, text: 'Before' },
      { noteId: null, text: 'Alpha Beta', children: [{ noteId: null, text: 'Child' }] },
      { noteId: null, text: 'After' },
      { noteId: null, text: 'te2', children: [{ noteId: 'note3', text: 'note3' }] },
    ]);
    expect(readCaretNoteId(remdo)).toBe(readOutline(remdo).at(-2)!.noteId);
    expect(remdo.editor.getRootElement()!.querySelector('a')!.getAttribute('href')).toBe('https://example.com');
    remdo.validate(() => {
      expect($getRoot().getAllTextNodes().find(node => node.getTextContent() === 'Alpha')!.hasFormat('bold')).toBe(true);
    });
  });

  it('retains rich paragraphs when replacing an inline selection', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note2');
    await pasteHtml(remdo, '<p><b>Alpha</b><br>Beta</p><p><a href="https://example.com">Gamma</a></p>', 'Alpha\nBeta\nGamma');
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'Alpha Beta', children: [
        { noteId: null, text: 'Gamma' },
        { noteId: 'note3', text: 'note3' },
      ] },
    ]);
    remdo.validate(() => {
      expect($findNoteById('note2')!.getChildren().filter($isTextNode)[0]!.hasFormat('bold')).toBe(true);
    });
    expect(remdo.editor.getRootElement()!.querySelector('a')!.getAttribute('href')).toBe('https://example.com');
    expect(readCaretNoteId(remdo)).toBe(readOutline(remdo)[1]!.children![0]!.noteId);
  });

  it('retains source children and subsequent note subtrees over an inline selection', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note2');
    await pasteHtml(remdo,
      '<ul><li><p>Alpha</p><p>Beta</p><ul><li>Child</li></ul></li><li>Gamma<ul><li>Grandchild</li></ul></li></ul>',
      'Alpha\nBeta\nChild\nGamma\nGrandchild');
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'Alpha Beta', children: [
        { noteId: null, text: 'Child' },
        { noteId: null, text: 'Gamma', children: [{ noteId: null, text: 'Grandchild' }] },
        { noteId: 'note3', text: 'note3' },
      ] },
    ]);
    expect(readCaretNoteId(remdo)).toBe(readOutline(remdo)[1]!.children![1]!.noteId);
    remdo.validate(() => {
      const selection = $getSelection();
      expect($isRangeSelection(selection) && selection.isCollapsed() && selection.anchor.offset).toBe(5);
    });
  });

  it('replaces a structural selection with rich blocks and their subtrees', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note2', 'note3');
    await pasteHtml(remdo, '<p><b>Before</b></p><ul><li>Alpha<br>Beta<ul><li>Child</li></ul></li></ul>', 'Before\nAlpha\nBeta\nChild');
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: null, text: 'Before' },
      { noteId: null, text: 'Alpha Beta', children: [{ noteId: null, text: 'Child' }] },
    ]);
    expect(readCaretNoteId(remdo)).toBe(readOutline(remdo)[2]!.noteId);
    remdo.validate(() => {
      expect($getRoot().getAllTextNodes().find(node => node.getTextContent() === 'Before')!.hasFormat('bold')).toBe(true);
    });
  });

  it('keeps a child-only HTML list following a paragraph over an inline selection', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note2');
    await pasteHtml(remdo, '<p>Before</p><ul><li><ul><li>Child</li></ul></li></ul>', 'Before\nChild');
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'Before', children: [
        { noteId: null, text: 'Child' },
        { noteId: 'note3', text: 'note3' },
      ] },
    ]);
  });

  for (const tag of ['div', 'blockquote']) {
    it(`keeps text and a list inside an HTML ${tag} wrapper`, meta({ fixture: 'tree' }), async ({ remdo }) => {
      await selectEntireNote(remdo, 'note2');
      await pasteHtml(remdo, `<${tag}>Before<ul><li>Child</li></ul>After</${tag}>`, 'Before\nChild\nAfter');
      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'note1' },
        { noteId: 'note2', text: 'Before', children: [
          { noteId: null, text: 'Child' },
          { noteId: null, text: 'After' },
          { noteId: 'note3', text: 'note3' },
        ] },
      ]);
    });
  }

  for (const destination of ['inline', 'caret']) {
    it(`promotes leading child-only lists for ${destination} paste`, meta({ fixture: 'tree' }), async ({ remdo }) => {
      if (destination === 'inline') await selectEntireNote(remdo, 'note1');
      else await placeCaretAtNote(remdo, 'note1', 0);
      await pasteHtml(remdo,
        '<ul><li><ul><li><ul><li>Child<ul><li>Grandchild</li></ul></li></ul></li></ul></li><li>After</li></ul>',
        'Child\nGrandchild\nAfter');
      if (destination === 'inline') {
        expect(remdo).toMatchOutline([
          { noteId: 'note1', text: 'Child', children: [
            { noteId: null, text: 'Grandchild' },
            { noteId: null, text: 'After' },
          ] },
          { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3' }] },
        ]);
      } else {
        expect(remdo).toMatchOutline([
          { noteId: null, text: 'Child', children: [{ noteId: null, text: 'Grandchild' }] },
          { noteId: null, text: 'After' },
          { noteId: 'note1', text: 'note1' },
          { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3' }] },
        ]);
      }
    });
  }

  it('preserves paragraph and hard breaks plus formatting in a body', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'Enter', shift: true });
    await pasteHtml(remdo, '<p><b>Alpha</b><br>Beta</p><p><a href="https://example.com">Gamma</a></p>', 'Alpha\nBeta\nGamma');
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2', body: 'Alpha\nBeta\nGamma' },
      { noteId: 'note3', text: 'note3' },
    ]);
    expect(remdo.editor.getRootElement()!.querySelector('a')!.getAttribute('href')).toBe('https://example.com');
    remdo.validate(() => {
      expect($getRoot().getAllTextNodes().find(node => node.getTextContent() === 'Alpha')!.hasFormat('bold')).toBe(true);
    });
  });

  it('keeps every mixed HTML block when a body needs plain-text flattening', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'Enter', shift: true });
    await pasteHtml(remdo, '<p>Before</p><ul><li>Alpha<br>Beta</li></ul><p>After</p>', 'Before\nAlpha\nBeta\nAfter');
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2', body: 'Before\nAlpha\nBeta\nAfter' },
      { noteId: 'note3', text: 'note3' },
    ]);
    remdo.validate(() => {
      const body = getNoteBody($findNoteById('note2')!)!;
      expect(remdo.editor.getElementByKey(body.getKey())!.querySelector('ul, ol, li')).toBeNull();
    });
  });

  it('preserves copied bodies and subtrees', meta({ fixture: 'tree' }), async ({ remdo }) => {
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

  it('keeps body text when a copied subtree replaces inline text', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'one');
    await pressKey(remdo, { key: 'Enter' });
    await typeText(remdo, 'two');
    await selectStructuralNotes(remdo, 'note2', 'note3');
    const payload = await copySelection(remdo);
    await selectEntireNote(remdo, 'note1');
    await pastePayload(remdo, payload);
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note2', children: [
        { noteId: null, text: 'one' },
        { noteId: null, text: 'two' },
        { noteId: null, text: 'note3' },
      ] },
      { noteId: 'note2', text: 'note2', body: 'one\ntwo', children: [{ noteId: 'note3', text: 'note3' }] },
    ]);
  });

  it('keeps a descendant body in the plain-text form when replacing inline text', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note3');
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'body');
    await selectStructuralNotes(remdo, 'note2', 'note3');
    const payload = await copySelection(remdo);
    await selectEntireNote(remdo, 'note1');
    await pastePayload(remdo, payload);
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note2', children: [
        { noteId: null, text: 'note3' },
        { noteId: null, text: 'body' },
      ] },
      { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3', body: 'body' }] },
    ]);
  });

  for (const separator of ['\n', '\r\n', '\r']) {
    it(`keeps plain-text separator ${JSON.stringify(separator)} as a note boundary`, meta({ fixture: 'flat' }), async ({ remdo }) => {
      await selectEntireNote(remdo, 'note2');
      const data = createDataTransfer();
      data.setData('text/plain', `Alpha${separator}Beta`);
      await remdo.dispatchCommand(PASTE_COMMAND, new ClipboardEvent('paste', { clipboardData: data }));
      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'note1' },
        { noteId: 'note2', text: 'Alpha', children: [{ noteId: null, text: 'Beta' }] },
        { noteId: 'note3', text: 'note3' },
      ]);
    });
  }
});
