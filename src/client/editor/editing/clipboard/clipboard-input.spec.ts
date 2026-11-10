import { $getNoteById, $getNoteByText,
  copySelection, createDataTransfer, meta, pastePayload, placeCaretAtNote, pressKey,
  readCaretNoteId, readOutline, selectEntireNote, selectStructuralNotes, typeText } from '#tests';
import { describe, expect, it } from 'vitest';
import { $getRoot, $getSelection, $isRangeSelection, $isTextNode, PASTE_COMMAND } from 'lexical';
import type { RemdoTestApi } from '#client/editor/dev';
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
      const link = $getNoteById('note1').getChildren().find($isNoteLinkNode)!;
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
      expect(remdo).toMatchOutline(`
        - note1
        - noAlpha Betate2
            - id:: note2
            - note3
      `);
    });

  }

  it('keeps inline code formatting across a normalized label break', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note2');
    await pasteHtml(remdo, '<p><code>Alpha<br>Beta</code></p>', 'Alpha\nBeta');
    remdo.validate(() => {
      const note = $getNoteById('note2');
      expect(note.getTextContent()).toBe('Alpha Beta');
      expect(note.getAllTextNodes().every(node => node.hasFormat('code'))).toBe(true);
    });
  });

  it('keeps bare text beside an HTML block when no plain-text flavor is supplied', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', 0);
    await pasteHtml(remdo, 'Before<p>After<br></p>', '');
    expect(remdo).toMatchOutline(`
      - note1
      - Before
      - After
      - note2
      - note3
    `);
  });

  it('retains mixed blocks, hierarchy, formatting and links through middle placement', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', 2);
    await pasteHtml(remdo,
      '<p>Before</p><ul><li><b>Alpha</b><br>Beta<ul><li>Child</li></ul></li></ul><p><a href="https://example.com">After</a></p>',
      'Before\nAlpha\nBeta\nChild\nAfter');
    expect(remdo).toMatchOutline(`
      - note1
      - no
          - id:: note2
      - Before
      - Alpha Beta
          - Child
      - After
      - te2
          - note3
    `);
    expect(readCaretNoteId(remdo)).toBe(readOutline(remdo).at(-2)!.noteId);
    expect(remdo.editor.getRootElement()!.querySelector('a')!.getAttribute('href')).toBe('https://example.com');
    remdo.validate(() => {
      expect($getRoot().getAllTextNodes().find(node => node.getTextContent() === 'Alpha')!.hasFormat('bold')).toBe(true);
    });
  });

  it('retains rich paragraphs when replacing an inline selection', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note2');
    await pasteHtml(remdo, '<p><b>Alpha</b><br>Beta</p><p><a href="https://example.com">Gamma</a></p>', 'Alpha\nBeta\nGamma');
    expect(remdo).toMatchOutline(`
      - note1
      - Alpha Beta
          - id:: note2
          - Gamma
          - note3
    `);
    remdo.validate(() => {
      expect($getNoteById('note2').getChildren().filter($isTextNode)[0]!.hasFormat('bold')).toBe(true);
    });
    expect(remdo.editor.getRootElement()!.querySelector('a')!.getAttribute('href')).toBe('https://example.com');
    expect(readCaretNoteId(remdo)).toBe(readOutline(remdo)[1]!.children![0]!.noteId);
  });

  it('retains source children and subsequent note subtrees over an inline selection', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note2');
    await pasteHtml(remdo,
      '<ul><li><p>Alpha</p><p>Beta</p><ul><li>Child</li></ul></li><li>Gamma<ul><li>Grandchild</li></ul></li></ul>',
      'Alpha\nBeta\nChild\nGamma\nGrandchild');
    expect(remdo).toMatchOutline(`
      - note1
      - Alpha Beta
          - id:: note2
          - Child
          - Gamma
              - Grandchild
          - note3
    `);
    expect(readCaretNoteId(remdo)).toBe(readOutline(remdo)[1]!.children![1]!.noteId);
    remdo.validate(() => {
      const selection = $getSelection();
      expect($isRangeSelection(selection) && selection.isCollapsed() && selection.anchor.offset).toBe(5);
    });
  });

  it('replaces a structural selection with rich blocks and their subtrees', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note2', 'note3');
    await pasteHtml(remdo, '<p><b>Before</b></p><ul><li>Alpha<br>Beta<ul><li>Child</li></ul></li></ul>', 'Before\nAlpha\nBeta\nChild');
    expect(remdo).toMatchOutline(`
      - note1
      - Before
      - Alpha Beta
          - Child
    `);
    expect(readCaretNoteId(remdo)).toBe(readOutline(remdo)[2]!.noteId);
    remdo.validate(() => {
      expect($getRoot().getAllTextNodes().find(node => node.getTextContent() === 'Before')!.hasFormat('bold')).toBe(true);
    });
  });

  it('keeps a child-only HTML list following a paragraph over an inline selection', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note2');
    await pasteHtml(remdo, '<p>Before</p><ul><li><ul><li>Child</li></ul></li></ul>', 'Before\nChild');
    expect(remdo).toMatchOutline(`
      - note1
      - Before
          - id:: note2
          - Child
          - note3
    `);
  });

  for (const tag of ['div', 'blockquote']) {
    it(`keeps text and a list inside an HTML ${tag} wrapper`, meta({ fixture: 'tree' }), async ({ remdo }) => {
      await selectEntireNote(remdo, 'note2');
      await pasteHtml(remdo, `<${tag}>Before<ul><li>Child</li></ul>After</${tag}>`, 'Before\nChild\nAfter');
      expect(remdo).toMatchOutline(`
        - note1
        - Before
            - id:: note2
            - Child
            - After
            - note3
      `);
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
        expect(remdo).toMatchOutline(`
          - Child
              - id:: note1
              - Grandchild
              - After
          - note2
              - note3
        `);
      } else {
        expect(remdo).toMatchOutline(`
          - Child
              - Grandchild
          - After
          - note1
          - note2
              - note3
        `);
      }
    });
  }

  it('preserves paragraph and hard breaks plus formatting in a body', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'Enter', shift: true });
    await pasteHtml(remdo, '<p><b>Alpha</b><br>Beta</p><p><a href="https://example.com">Gamma</a></p>', 'Alpha\nBeta\nGamma');
    expect(remdo).toMatchOutline(`
      - note1
      - note2
          > Alpha
          > Beta
          > Gamma
      - note3
    `);
    expect(remdo.editor.getRootElement()!.querySelector('a')!.getAttribute('href')).toBe('https://example.com');
    remdo.validate(() => {
      expect($getRoot().getAllTextNodes().find(node => node.getTextContent() === 'Alpha')!.hasFormat('bold')).toBe(true);
    });
  });

  it('keeps every mixed HTML block when a body needs plain-text flattening', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'Enter', shift: true });
    await pasteHtml(remdo, '<p>Before</p><ul><li>Alpha<br>Beta</li></ul><p>After</p>', 'Before\nAlpha\nBeta\nAfter');
    expect(remdo).toMatchOutline(`
      - note1
      - note2
          > Before
          > Alpha
          > Beta
          > After
      - note3
    `);
    remdo.validate(() => {
      const body = getNoteBody($getNoteByText('note2'))!;
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
    expect(remdo).toMatchOutline(`
      - note2
          > one
          > two
          - note3
      - note1
          - id:: note1
      - note2
          > one
          > two
          - id:: note2
          - note3
              - id:: note3
    `);
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
    expect(remdo).toMatchOutline(`
      - note2
          - id:: note1
          - one
          - two
          - note3
      - note2
          > one
          > two
          - note3
    `);
  });

  it('keeps a descendant body in the plain-text form when replacing inline text', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note3');
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'body');
    await selectStructuralNotes(remdo, 'note2', 'note3');
    const payload = await copySelection(remdo);
    await selectEntireNote(remdo, 'note1');
    await pastePayload(remdo, payload);
    expect(remdo).toMatchOutline(`
      - note2
          - id:: note1
          - note3
          - body
      - note2
          - note3
              > body
    `);
  });

  for (const separator of ['\n', '\r\n', '\r']) {
    it(`keeps plain-text separator ${JSON.stringify(separator)} as a note boundary`, meta({ fixture: 'flat' }), async ({ remdo }) => {
      await selectEntireNote(remdo, 'note2');
      const data = createDataTransfer();
      data.setData('text/plain', `Alpha${separator}Beta`);
      await remdo.dispatchCommand(PASTE_COMMAND, new ClipboardEvent('paste', { clipboardData: data }));
      expect(remdo).toMatchOutline(`
        - note1
        - Alpha
            - id:: note2
            - Beta
        - note3
      `);
    });
  }
});
