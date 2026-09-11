import { describe, expect, it } from 'vitest';
import {
  placeCaretAtNote,
  placeCaretAtNoteTextNode,
  pressKey,
  readCaretNoteId,
  setRawNoteCheckedState,
  selectAcrossNoteTextNodes,
  selectEntireNote,
  selectNoteTextRange,
  typeText,
  meta,
} from '#tests';
import { $createTextNode, $getSelection, $isTextNode, UNDO_COMMAND } from 'lexical';
import type { $createRangeSelection } from 'lexical';
import { $createLinkNode, $isLinkNode } from '@lexical/link';
import { $setNoteFolded } from '#client/editor/outline/fold-state';
import { $createDateNode } from '#client/editor/features/date/date-node';
import { $findNoteById } from '#client/editor/outline/note-traversal';
import { $isNoteLinkNode } from '#client/editor/features/links/note-link-node';

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

  it('enter in the middle keeps the leading identity while trailing text becomes a fresh sibling', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', 2);
    await pressKey(remdo, { key: 'Enter' });
    const trailingNoteId = readCaretNoteId(remdo);
    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'no' },
      { noteId: trailingNoteId, text: 'Xte1' },
      { noteId: 'note2', text: 'note2', children: [ { noteId: 'note3', text: 'note3' } ] },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: trailingNoteId });
  });

  it('enter at the start of a later text node splits the note (multi-text)', meta({ fixture: 'formatted' }), async ({ remdo }) => {
    await placeCaretAtNoteTextNode(remdo, 'mixedFormatting', 1, 0);

    await pressKey(remdo, { key: 'Enter' });
    const trailingNoteId = readCaretNoteId(remdo);

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
      { noteId: 'mixedFormatting', text: 'plain ' },
      { noteId: trailingNoteId, text: 'bold italic underline plain' },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: trailingNoteId });
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

  it('moves zoom-root state and descendants to the trailing first child and restores them on Backspace', meta({ fixture: 'tree', viewProps: { zoomNoteId: 'note2' } }), async ({ remdo }) => {
    await remdo.mutate(() => {
      const note = $findNoteById('note2')!;
      note.clear();
      note.append($createTextNode('left right'));
    });
    await placeCaretAtNote(remdo, 'note2', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'body');
    await setRawNoteCheckedState(remdo, 'note2', true);
    await setRawNoteCheckedState(remdo, 'note3', true);
    await remdo.mutate(() => {
      $setNoteFolded($findNoteById('note2')!, true);
    });

    await placeCaretAtNote(remdo, 'note2', 5);
    await pressKey(remdo, { key: 'Enter' });
    const splitChildId = readCaretNoteId(remdo);

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      {
        noteId: 'note2',
        text: 'left ',
        checked: true,
        children: [
          {
            noteId: splitChildId,
            text: 'right',
            body: 'body',
            folded: true,
            children: [{ noteId: 'note3', text: 'note3', checked: true }],
          },
        ],
      },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: splitChildId });

    await pressKey(remdo, { key: 'Backspace' });

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      {
        noteId: 'note2',
        text: 'left right',
        body: 'body',
        checked: true,
        folded: true,
        children: [{ noteId: 'note3', text: 'note3', checked: true }],
      },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });
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

  it('enter split inside a nested note inserts a fresh trailing sibling at the same depth', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', 2);
    await pressKey(remdo, { key: 'Enter' });
    const trailingNoteId = readCaretNoteId(remdo);
    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'no' },
      { noteId: trailingNoteId, text: 'Xte2', children: [ { noteId: 'note3', text: 'note3' } ] },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: trailingNoteId });
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
    const trailingNoteId = readCaretNoteId(remdo);
    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline([
      {
        noteId: 'note1',
        text: 'note1',
        children: [
          {
            noteId: 'note2',
            text: 'no',
          },
          {
            noteId: trailingNoteId,
            text: 'Xte2',
            children: [{ noteId: 'note3', text: 'note3' }],
          },
          { noteId: 'note4', text: 'note4' },
        ],
      },
      { noteId: 'note5', text: 'note5' },
      { noteId: 'note6', text: 'note6', children: [{ noteId: 'note7', text: 'note7' }] },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: trailingNoteId });
  });

  it('moves body, descendants, and fold state to the fresh suffix while keeping identity and checked state leading', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await remdo.mutate(() => {
      const note = $findNoteById('note2')!;
      note.clear();
      note.append($createTextNode('left right'));
    });
    await placeCaretAtNote(remdo, 'note2', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'body');
    await setRawNoteCheckedState(remdo, 'note2', true);
    await setRawNoteCheckedState(remdo, 'note3', true);
    await remdo.mutate(() => {
      $setNoteFolded($findNoteById('note2')!, true);
    });

    await placeCaretAtNote(remdo, 'note2', 5);
    await pressKey(remdo, { key: 'Enter' });
    const trailingNoteId = readCaretNoteId(remdo);

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'left ', checked: true },
      {
        noteId: trailingNoteId,
        text: 'right',
        body: 'body',
        folded: true,
        children: [{ noteId: 'note3', text: 'note3', checked: true }],
      },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: trailingNoteId });

    await pressKey(remdo, { key: 'Backspace' });

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      {
        noteId: 'note2',
        text: 'left right',
        body: 'body',
        folded: true,
        checked: true,
        children: [{ noteId: 'note3', text: 'note3', checked: true }],
      },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });
  });

  it('restores a whitespace-leading split without retiring the original identity', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await remdo.mutate(() => {
      const note = $findNoteById('note1')!;
      note.clear();
      note.append($createTextNode(' note'));
    });
    await setRawNoteCheckedState(remdo, 'note1', true);

    await placeCaretAtNote(remdo, 'note1', 1);
    await pressKey(remdo, { key: 'Enter' });
    const trailingNoteId = readCaretNoteId(remdo);

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: ' ', checked: true },
      { noteId: trailingNoteId, text: 'note' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);

    await pressKey(remdo, { key: 'Backspace' });

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: ' note', checked: true },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
  });

  describe('inline text selection', () => {
    it('removes the selected text and splits as a middle caret would', meta({ fixture: 'tree' }), async ({ remdo }) => {
      await selectNoteTextRange(remdo, 'note1', 2, 4);
      await pressKey(remdo, { key: 'Enter' });
      const trailingNoteId = readCaretNoteId(remdo);
      await typeText(remdo, 'X');

      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'no' },
        { noteId: trailingNoteId, text: 'X1' },
        { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3' }] },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: trailingNoteId });
    });

    it('keeps the noteId leading and moves children to the fresh trailing note', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
      await selectNoteTextRange(remdo, 'note2', 2, 4);
      await pressKey(remdo, { key: 'Enter' });
      const trailingNoteId = readCaretNoteId(remdo);

      expect(remdo).toMatchOutline([
        {
          noteId: 'note1',
          text: 'note1',
          children: [
            { noteId: 'note2', text: 'no' },
            { noteId: trailingNoteId, text: '2', children: [{ noteId: 'note3', text: 'note3' }] },
            { noteId: 'note4', text: 'note4' },
          ],
        },
        { noteId: 'note5', text: 'note5' },
        { noteId: 'note6', text: 'note6', children: [{ noteId: 'note7', text: 'note7' }] },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: trailingNoteId });
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
      const trailingNoteId = readCaretNoteId(remdo);

      expect(remdo).toMatchOutline([
        {
          noteId: 'bold',
          text: 'bold',
          children: [
            { noteId: 'italic', text: 'italic', children: [{ noteId: 'target', text: 'target' }] },
          ],
        },
        { noteId: 'underline', text: 'underline' },
        { noteId: 'mixedFormatting', text: 'pla' },
        { noteId: trailingNoteId, text: 'lic underline plain' },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: trailingNoteId });
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
      const trailingNoteId = readCaretNoteId(remdo);

      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'Jan 2, 2026' },
        { noteId: trailingNoteId, text: 'Mar 4, 2026' },
        { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3' }] },
      ]);
    });

    it('splits a link at the exact caret after removing a selection inside it', meta({ fixture: 'tree' }), async ({ remdo }) => {
      await remdo.mutate(() => {
        const note = $findNoteById('note1')!;
        note.clear();
        const link = $createLinkNode('https://example.com/', {
          rel: 'noopener',
          target: '_blank',
          title: 'Example',
        });
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
      const trailingNoteId = readCaretNoteId(remdo);

      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'before li' },
        { noteId: trailingNoteId, text: 'xt after' },
        { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3' }] },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: trailingNoteId });
      remdo.validate(() => {
        const leadingLink = $findNoteById('note1')!.getChildren().find($isLinkNode)!;
        const trailingLink = $findNoteById(trailingNoteId)!.getChildren().find($isLinkNode)!;
        expect(leadingLink.getURL()).toBe('https://example.com/');
        expect(trailingLink.getURL()).toBe('https://example.com/');
        expect(leadingLink.getRel()).toBe('noopener noreferrer');
        expect(trailingLink.getRel()).toBe(leadingLink.getRel());
        expect(leadingLink.getTarget()).toBe('_blank');
        expect(trailingLink.getTarget()).toBe('_blank');
        expect(leadingLink.getTitle()).toBe('Example');
        expect(trailingLink.getTitle()).toBe('Example');
      });
    });

    it('preserves a note-link target on both sides of an exact split', meta({ fixture: 'links' }), async ({ remdo }) => {
      await placeCaretAtNote(remdo, 'note1', 0);
      await remdo.mutate(() => {
        const selection = $getSelection() as ReturnType<typeof $createRangeSelection>;
        const noteLink = $findNoteById('note1')!.getChildren().find($isNoteLinkNode)!;
        const linkText = noteLink.getChildren().filter($isTextNode)[0]!;
        selection.setTextNodeRange(linkText, 2, linkText, 2);
      });

      await pressKey(remdo, { key: 'Enter' });
      const trailingNoteId = readCaretNoteId(remdo);

      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'same no' },
        { noteId: trailingNoteId, text: 'te2 cross /n/otherDoc_remoteNote' },
        { noteId: 'note2', text: 'note2' },
        { noteId: 'note3', text: 'note3' },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: trailingNoteId });
      remdo.validate(() => {
        const leadingLink = $findNoteById('note1')!.getChildren().find($isNoteLinkNode)!;
        const trailingLink = $findNoteById(trailingNoteId)!.getChildren().find($isNoteLinkNode)!;
        expect(leadingLink.getLinkRef()).toEqual(trailingLink.getLinkRef());
        expect(leadingLink.getNoteId()).toBe('note2');
      });
    });

    it('splits after a link when following text remains', meta({ fixture: 'tree' }), async ({ remdo }) => {
      await remdo.mutate(() => {
        const note = $findNoteById('note1')!;
        note.clear();
        const link = $createLinkNode('https://example.com/');
        link.append($createTextNode('link'));
        note.append($createTextNode('before '), link, $createTextNode(' after'));
      });
      await placeCaretAtNote(remdo, 'note1', 0);
      await remdo.mutate(() => {
        const selection = $getSelection() as ReturnType<typeof $createRangeSelection>;
        const link = $findNoteById('note1')!.getChildren().find($isLinkNode)!;
        const linkText = link.getChildren().filter($isTextNode)[0]!;
        selection.setTextNodeRange(linkText, 4, linkText, 4);
      });
      await pressKey(remdo, { key: 'Enter' });
      const trailingNoteId = readCaretNoteId(remdo);

      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'before link' },
        { noteId: trailingNoteId, text: ' after' },
        { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3' }] },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: trailingNoteId });
      remdo.validate(() => {
        const link = $findNoteById('note1')!.getChildren().find($isLinkNode)!;
        expect(link.getURL()).toBe('https://example.com/');
      });
    });

    it('deletes a selection ending at a link boundary and splits in one undo step', meta({ fixture: 'links' }), async ({ remdo }) => {
      await placeCaretAtNote(remdo, 'note1', 0);
      await remdo.mutate(() => {
        const selection = $getSelection() as ReturnType<typeof $createRangeSelection>;
        const link = $findNoteById('note1')!.getChildren().find($isNoteLinkNode)!;
        const linkText = link.getChildren().filter($isTextNode)[0]!;
        selection.setTextNodeRange(linkText, 2, linkText, 5);
      });
      await pressKey(remdo, { key: 'Enter' });
      const trailingNoteId = readCaretNoteId(remdo);

      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'same no' },
        { noteId: trailingNoteId, text: ' cross /n/otherDoc_remoteNote' },
        { noteId: 'note2', text: 'note2' },
        { noteId: 'note3', text: 'note3' },
      ]);

      await remdo.dispatchCommand(UNDO_COMMAND);

      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'same note2 cross /n/otherDoc_remoteNote' },
        { noteId: 'note2', text: 'note2' },
        { noteId: 'note3', text: 'note3' },
      ]);
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
            { noteId: newChildId, text: '2', children: [{ noteId: 'note3', text: 'note3' }] },
          ],
        },
      ]);
    });
  });
});
