import { describe, expect, it } from 'vitest';
import {
  placeCaretAtNote,
  placeCaretAtNoteTextNode,
  pressKey,
  readCaretNoteId,
  selectAcrossNoteTextNodes,
  selectEntireNote,
  selectNoteTextRange,
  typeText,
  meta,
} from '#tests';
import { $createTextNode, $getSelection, $isTextNode } from 'lexical';
import type { $createRangeSelection } from 'lexical';
import { $createLinkNode, $isLinkNode } from '@lexical/link';
import { $setNoteFolded } from '#client/editor/runtime/fold-state';
import { $createDateNode } from '#client/editor/features/date/date-node';
import { $findNoteById } from '#client/editor/outline/note-traversal';

describe('insertion semantics (docs/insertion.md)', () => {
  it('enter at start inserts a previous sibling and keeps children with the original', meta({ fixture: 'basic' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter' });
    const newNoteId = readCaretNoteId(remdo);
    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline([
      { noteId: newNoteId, text: 'X' },
      { noteId: 'note1', text: 'note1', children: [ { noteId: 'note2', text: 'note2' } ] },
      { noteId: 'note3', text: 'note3' },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: newNoteId });
  });

  it('enter in the middle splits into an above sibling while trailing text and children stay with the original', meta({ fixture: 'tree' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note1', 2);
    await pressKey(remdo, { key: 'Enter' });
    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline([
      { noteId: null, text: 'no' },
      { noteId: 'note1', text: 'Xte1' },
      { noteId: 'note2', text: 'note2', children: [ { noteId: 'note3', text: 'note3' } ] },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
  });

  it('enter at the start of a later text node splits the note (multi-text)', meta({ fixture: 'formatted' }), async ({ remdo }) => {
    await placeCaretAtNoteTextNode(remdo, 'mixedFormatting', 1, 0);

    await pressKey(remdo, { key: 'Enter' });

    expect(remdo).toMatchOutline([
      {
        noteId: 'bold',
        text: 'bold',
        children: [
          {
            noteId: 'italic',
            text: 'italic',
            children: [{ noteId: 'target', text: 'target' }],
          },
        ],
      },
      { noteId: 'underline', text: 'underline' },
      { noteId: null, text: 'plain ' },
      { noteId: 'mixedFormatting', text: 'bold italic underline plain' },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'mixedFormatting' });
  });

  it('enter at end creates a first child and focuses it', meta({ fixture: 'basic' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter' });
    const newNoteId = readCaretNoteId(remdo);

    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline([
      {
        noteId: 'note1',
        text: 'note1',
        children: [
          { noteId: newNoteId, text: 'X' },
          { noteId: 'note2', text: 'note2' },
        ],
      },
      { noteId: 'note3', text: 'note3' },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: newNoteId });
  });

  it('enter at end of a folded parent inserts a next sibling', meta({ fixture: 'basic' }), async ({ remdo }) => {
    await remdo.mutate(() => {
      const note = $findNoteById('note1')!;
      $setNoteFolded(note, true);
    });

    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter' });
    const newNoteId = readCaretNoteId(remdo);
    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1', folded: true, children: [{ noteId: 'note2', text: 'note2' }] },
      { noteId: newNoteId, text: 'X' },
      { noteId: 'note3', text: 'note3' },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: newNoteId });
  });

  it('enter at end of the zoom root inserts a first child', meta({ fixture: 'flat', viewProps: { zoomNoteId: 'note2' } }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter' });
    const newNoteId = readCaretNoteId(remdo);
    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2', children: [{ noteId: newNoteId, text: 'X' }] },
      { noteId: 'note3', text: 'note3' },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: newNoteId });
  });

  it('enter at start of the zoom root inserts a first child', meta({ fixture: 'flat', viewProps: { zoomNoteId: 'note2' } }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', 0);
    await pressKey(remdo, { key: 'Enter' });
    const newNoteId = readCaretNoteId(remdo);
    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2', children: [{ noteId: newNoteId, text: 'X' }] },
      { noteId: 'note3', text: 'note3' },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: newNoteId });
  });

  it('enter in the middle of the zoom root splits into a first child and moves focus to that child', meta({ fixture: 'flat', viewProps: { zoomNoteId: 'note2' } }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', 2);
    await pressKey(remdo, { key: 'Enter' });
    const newChildId = readCaretNoteId(remdo);

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'no', children: [{ noteId: newChildId, text: 'te2' }] },
      { noteId: 'note3', text: 'note3' },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: newChildId });
  });

  it('enter in the middle of the zoom root keeps existing descendants as direct children', meta({ fixture: 'tree', viewProps: { zoomNoteId: 'note2' } }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', 2);
    await pressKey(remdo, { key: 'Enter' });
    const splitChildId = readCaretNoteId(remdo);

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      {
        noteId: 'note2',
        text: 'no',
        children: [
          { noteId: splitChildId, text: 'te2' },
          { noteId: 'note3', text: 'note3' },
        ],
      },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: splitChildId });
  });

  it('enter is a no-op in structural mode', meta({ fixture: 'tree' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

    const before = remdo.getEditorState();
    await pressKey(remdo, { key: 'Enter' });

    expect(remdo).toMatchEditorState(before);
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });
  });

  it('enter split inside nested note inserts sibling above within same parent', meta({ fixture: 'tree' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note2', 2);
    await pressKey(remdo, { key: 'Enter' });
    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: null, text: 'no' },
      { noteId: 'note2', text: 'Xte2', children: [ { noteId: 'note3', text: 'note3' } ] },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });
  });

  it('enter at end inserts new first child ahead of existing children', meta({ fixture: 'tree' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note2', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter' });
    const newNoteId = readCaretNoteId(remdo);
    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      {
        noteId: 'note2',
        text: 'note2',
        children: [
          { noteId: newNoteId, text: 'X' },
          { noteId: 'note3', text: 'note3' },
        ],
      },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: newNoteId });
  });

  it('enter at start of nested note inserts previous sibling at same depth', meta({ fixture: 'tree' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note3', 0);
    await pressKey(remdo, { key: 'Enter' });
    const newNoteId = readCaretNoteId(remdo);
    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      {
        noteId: 'note2',
        text: 'note2',
        children: [
          { noteId: newNoteId, text: 'X' },
          { noteId: 'note3', text: 'note3' },
        ],
      },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: newNoteId });
  });

  it('enter at end on a leaf note inserts a next sibling and focuses it', meta({ fixture: 'tree' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter' });
    const newNoteId = readCaretNoteId(remdo);
    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: newNoteId, text: 'X' },
      { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3' }] },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: newNoteId });
  });

  it('enter at start when the previous sibling has children inserts a new sibling above and keeps that subtree intact', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note4', 0);
    await pressKey(remdo, { key: 'Enter' });
    const newNoteId = readCaretNoteId(remdo);
    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline([
      {
        noteId: 'note1',
        text: 'note1',
        children: [
          {
            noteId: 'note2',
            text: 'note2',
            children: [{ noteId: 'note3', text: 'note3' }],
          },
          { noteId: newNoteId, text: 'X' },
          { noteId: 'note4', text: 'note4' },
        ],
      },
      { noteId: 'note5', text: 'note5' },
      { noteId: 'note6', text: 'note6', children: [{ noteId: 'note7', text: 'note7' }] },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: newNoteId });
  });

  it('enter in the middle of a note with descendants keeps the subtree on the trailing segment', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note2', 2);
    await pressKey(remdo, { key: 'Enter' });
    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline([
      {
        noteId: 'note1',
        text: 'note1',
        children: [
          {
            noteId: null,
            text: 'no',
          },
          {
            noteId: 'note2',
            text: 'Xte2',
            children: [{ noteId: 'note3', text: 'note3' }],
          },
          { noteId: 'note4', text: 'note4' },
        ],
      },
      { noteId: 'note5', text: 'note5' },
      { noteId: 'note6', text: 'note6', children: [{ noteId: 'note7', text: 'note7' }] },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });
  });

  describe('inline text selection', () => {
    it('removes the selected text and splits as a middle caret would', meta({ fixture: 'tree' }), async ({ remdo }) => {
      await selectNoteTextRange(remdo, 'note1', 2, 4);
      await pressKey(remdo, { key: 'Enter' });
      await typeText(remdo, 'X');

      expect(remdo).toMatchOutline([
        { noteId: null, text: 'no' },
        { noteId: 'note1', text: 'X1' },
        { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3' }] },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
    });

    it('keeps the noteId and children on the note holding the trailing text', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
      await selectNoteTextRange(remdo, 'note2', 2, 4);
      await pressKey(remdo, { key: 'Enter' });

      expect(remdo).toMatchOutline([
        {
          noteId: 'note1',
          text: 'note1',
          children: [
            { noteId: null, text: 'no' },
            { noteId: 'note2', text: '2', children: [{ noteId: 'note3', text: 'note3' }] },
            { noteId: 'note4', text: 'note4' },
          ],
        },
        { noteId: 'note5', text: 'note5' },
        { noteId: 'note6', text: 'note6', children: [{ noteId: 'note7', text: 'note7' }] },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });
    });

    it('applies the start rule when the selection touches the note start', meta({ fixture: 'tree' }), async ({ remdo }) => {
      await selectNoteTextRange(remdo, 'note1', 0, 2);
      await pressKey(remdo, { key: 'Enter' });
      await typeText(remdo, 'X');

      expect(remdo).toMatchOutline([
        { noteId: null, text: 'X' },
        { noteId: 'note1', text: 'te1' },
        { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3' }] },
      ]);
    });

    it('applies the end rule when the selection touches the note end', meta({ fixture: 'tree' }), async ({ remdo }) => {
      await selectNoteTextRange(remdo, 'note1', 3, Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Enter' });
      const newNoteId = readCaretNoteId(remdo);
      await typeText(remdo, 'X');

      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'not' },
        { noteId: newNoteId, text: 'X' },
        { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3' }] },
      ]);
    });

    it('clears the note and applies the end rule when the whole text is selected', meta({ fixture: 'tree' }), async ({ remdo }) => {
      await selectEntireNote(remdo, 'note1');
      await pressKey(remdo, { key: 'Enter' });
      const newNoteId = readCaretNoteId(remdo);
      await typeText(remdo, 'X');

      expect(remdo).toMatchOutline([
        { noteId: 'note1' },
        { noteId: newNoteId, text: 'X' },
        { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3' }] },
      ]);
    });

    it('creates a first child when the whole text of a parent is selected', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
      await selectEntireNote(remdo, 'note2');
      await pressKey(remdo, { key: 'Enter' });
      const newNoteId = readCaretNoteId(remdo);
      await typeText(remdo, 'X');

      expect(remdo).toMatchOutline([
        {
          noteId: 'note1',
          text: 'note1',
          children: [
            {
              noteId: 'note2',
              children: [
                { noteId: newNoteId, text: 'X' },
                { noteId: 'note3', text: 'note3' },
              ],
            },
            { noteId: 'note4', text: 'note4' },
          ],
        },
        { noteId: 'note5', text: 'note5' },
        { noteId: 'note6', text: 'note6', children: [{ noteId: 'note7', text: 'note7' }] },
      ]);
    });

    it('splits when the selection spans several text nodes', meta({ fixture: 'formatted' }), async ({ remdo }) => {
      await selectAcrossNoteTextNodes(remdo, 'mixedFormatting', 0, 3, 2, 3);
      await pressKey(remdo, { key: 'Enter' });

      expect(remdo).toMatchOutline([
        {
          noteId: 'bold',
          text: 'bold',
          children: [
            { noteId: 'italic', text: 'italic', children: [{ noteId: 'target', text: 'target' }] },
          ],
        },
        { noteId: 'underline', text: 'underline' },
        { noteId: null, text: 'pla' },
        { noteId: 'mixedFormatting', text: 'lic underline plain' },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'mixedFormatting' });
    });

    it('inserts a note when removal leaves only a decorator', meta({ fixture: 'tree' }), async ({ remdo }) => {
      await remdo.mutate(() => {
        $findNoteById('note1')!.append($createDateNode('2026-01-02'));
      });
      await selectNoteTextRange(remdo, 'note1', 0, Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Enter' });
      await typeText(remdo, 'X');

      expect(remdo).toMatchOutline([
        { noteId: null, text: 'X' },
        { noteId: 'note1', text: 'Jan 2, 2026' },
        { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3' }] },
      ]);
    });

    it('splits between decorators when removal empties the text between them', meta({ fixture: 'tree' }), async ({ remdo }) => {
      await remdo.mutate(() => {
        const item = $findNoteById('note1')!;
        item.clear();
        item.append($createDateNode('2026-01-02'));
        item.append($createTextNode('mid'));
        item.append($createDateNode('2026-03-04'));
      });
      await selectNoteTextRange(remdo, 'note1', 0, Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Enter' });

      expect(remdo).toMatchOutline([
        { noteId: null, text: 'Jan 2, 2026' },
        { noteId: 'note1', text: 'Mar 4, 2026' },
        { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3' }] },
      ]);
    });

    it('splits at the link when the selection sits inside one', meta({ fixture: 'tree' }), async ({ remdo }) => {
      await remdo.mutate(() => {
        const note = $findNoteById('note1')!;
        note.clear();
        const link = $createLinkNode('https://example.com/');
        link.append($createTextNode('linktext'));
        note.append($createTextNode('before '));
        note.append(link);
        note.append($createTextNode(' after'));
      });
      await placeCaretAtNote(remdo, 'note1', 0);
      await remdo.mutate(() => {
        const selection = $getSelection() as ReturnType<typeof $createRangeSelection>;
        const link = $findNoteById('note1')!.getChildren().find($isLinkNode)!;
        const linkText = link.getChildren().filter($isTextNode)[0]!;
        selection.setTextNodeRange(linkText, 2, linkText, 6);
      });
      await pressKey(remdo, { key: 'Enter' });

      expect(remdo).toMatchOutline([
        { noteId: null, text: 'before ' },
        { noteId: 'note1', text: 'lixt after' },
        { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3' }] },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
    });

    it('leaves shift+enter to the note body, keeping the selected text', meta({ fixture: 'tree' }), async ({ remdo }) => {
      await selectNoteTextRange(remdo, 'note1', 2, 4);
      await pressKey(remdo, { key: 'Enter', shift: true });
      await typeText(remdo, 'in body');

      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'note1', body: 'in body' },
        { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3' }] },
      ]);
    });

    it('keeps insertion inside the zoom boundary', meta({ fixture: 'tree', viewProps: { zoomNoteId: 'note2' } }), async ({ remdo }) => {
      await selectNoteTextRange(remdo, 'note2', 2, 4);
      await pressKey(remdo, { key: 'Enter' });
      const newChildId = readCaretNoteId(remdo);

      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'note1' },
        {
          noteId: 'note2',
          text: 'no',
          children: [
            { noteId: newChildId, text: '2' },
            { noteId: 'note3', text: 'note3' },
          ],
        },
      ]);
    });
  });
});
