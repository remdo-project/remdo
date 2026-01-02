import { describe, expect, it } from 'vitest';
import { placeCaretAtNoteId, pressKey, readCaretNoteId, typeText } from '#tests';

describe('insertion semantics (docs/insertion.md)', () => {
  it('enter at start inserts a previous sibling and keeps children with the original', async ({ remdo }) => {
    await remdo.load('basic');

    await placeCaretAtNoteId(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter' });
    const newNoteId = readCaretNoteId(remdo);
    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline([
      { text: 'X' },
      { text: 'note1', children: [ { text: 'note2' } ] },
      { text: 'note3' },
    ]);
    expect(remdo).toMatchSelectionIds([newNoteId]);
  });

  it('enter in the middle splits into an above sibling while trailing text and children stay with the original', async ({ remdo }) => {
    await remdo.load('tree');

    await placeCaretAtNoteId(remdo, 'note1', 2);
    await pressKey(remdo, { key: 'Enter' });

    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline([
      { text: 'no' },
      { text: 'Xte1' },
      { text: 'note2', children: [ { text: 'note3' } ] },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'Xte1' });
  });

  it('enter at end creates a first child and focuses it', async ({ remdo }) => {
    await remdo.load('basic');

    await placeCaretAtNoteId(remdo, 'note1', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter' });

    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline([
      {
        text: 'note1',
        children: [
          { text: 'X' },
          { text: 'note2' },
        ],
      },
      { text: 'note3' },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'X' });
  });

  it('enter is a no-op in structural mode', async ({ remdo }) => {
    await remdo.load('tree');

    await placeCaretAtNoteId(remdo, 'note2');
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    expect(remdo).toMatchSelectionIds(['note2', 'note3']);

    const before = remdo.getEditorState();
    await pressKey(remdo, { key: 'Enter' });

    expect(remdo).toMatchEditorState(before);
    expect(remdo).toMatchSelectionIds(['note2', 'note3']);
  });

  it('enter split inside nested note inserts sibling above within same parent', async ({ remdo }) => {
    await remdo.load('tree');

    await placeCaretAtNoteId(remdo, 'note2', 2);
    await pressKey(remdo, { key: 'Enter' });
    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline([
      { text: 'note1' },
      { text: 'no' },
      { text: 'Xte2', children: [ { text: 'note3' } ] },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'Xte2' });
  });

  it('enter at end inserts new first child ahead of existing children', async ({ remdo }) => {
    await remdo.load('tree');

    await placeCaretAtNoteId(remdo, 'note2', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter' });
    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline([
      { text: 'note1' },
      {
        text: 'note2',
        children: [
          { text: 'X' },
          { text: 'note3' },
        ],
      },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'X' });
  });

  it('enter at start of nested note inserts previous sibling at same depth', async ({ remdo }) => {
    await remdo.load('tree');

    await placeCaretAtNoteId(remdo, 'note3', 0);
    await pressKey(remdo, { key: 'Enter' });
    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline([
      { text: 'note1' },
      {
        text: 'note2',
        children: [
          { text: 'X' },
          { text: 'note3' },
        ],
      },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'X' });
  });

  it('enter at end on a leaf note inserts a next sibling and focuses it', async ({ remdo }) => {
    await remdo.load('tree');

    await placeCaretAtNoteId(remdo, 'note1', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter' });
    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline([
      { text: 'note1' },
      { text: 'X' },
      { text: 'note2', children: [{ text: 'note3' }] },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'X' });
  });

  it('enter at start when the previous sibling has children inserts a new sibling above and keeps that subtree intact', async ({ remdo }) => {
    await remdo.load('tree-complex');

    await placeCaretAtNoteId(remdo, 'note4', 0);
    await pressKey(remdo, { key: 'Enter' });
    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline([
      {
        text: 'note1',
        children: [
          {
            text: 'note2',
            children: [{ text: 'note3' }],
          },
          { text: 'X' },
          { text: 'note4' },
        ],
      },
      { text: 'note5' },
      { text: 'note6', children: [{ text: 'note7' }] },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'X' });
  });

  it('enter in the middle of a note with descendants keeps the subtree on the trailing segment', async ({ remdo }) => {
    await remdo.load('tree-complex');

    await placeCaretAtNoteId(remdo, 'note2', 2);
    await pressKey(remdo, { key: 'Enter' });
    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline([
      {
        text: 'note1',
        children: [
          {
            text: 'no',
          },
          {
            text: 'Xte2',
            children: [{ text: 'note3' }],
          },
          { text: 'note4' },
        ],
      },
      { text: 'note5' },
      { text: 'note6', children: [{ text: 'note7' }] },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'Xte2' });
  });
});
