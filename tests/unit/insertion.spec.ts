import { describe, expect, it } from 'vitest';
import { placeCaretAtNote, pressKey, readCaretNoteId, typeText } from '#tests';

describe('insertion semantics (docs/insertion.md)', () => {
  it('enter at start inserts a previous sibling and keeps children with the original', async ({ remdo }) => {
    await remdo.load('basic');

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

  it('enter in the middle splits into an above sibling while trailing text and children stay with the original', async ({ remdo }) => {
    await remdo.load('tree');

    await placeCaretAtNote(remdo, 'note1', 2);
    await pressKey(remdo, { key: 'Enter' });
    const newNoteId = readCaretNoteId(remdo);

    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'no' },
      { noteId: newNoteId, text: 'Xte1' },
      { noteId: 'note2', text: 'note2', children: [ { noteId: 'note3', text: 'note3' } ] },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: newNoteId });
  });

  it('enter at end creates a first child and focuses it', async ({ remdo }) => {
    await remdo.load('basic');

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

  it('enter is a no-op in structural mode', async ({ remdo }) => {
    await remdo.load('tree');

    await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

    const before = remdo.getEditorState();
    await pressKey(remdo, { key: 'Enter' });

    expect(remdo).toMatchEditorState(before);
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });
  });

  it('enter split inside nested note inserts sibling above within same parent', async ({ remdo }) => {
    await remdo.load('tree');

    await placeCaretAtNote(remdo, 'note2', 2);
    await pressKey(remdo, { key: 'Enter' });
    const newNoteId = readCaretNoteId(remdo);
    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'no' },
      { noteId: newNoteId, text: 'Xte2', children: [ { noteId: 'note3', text: 'note3' } ] },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: newNoteId });
  });

  it('enter at end inserts new first child ahead of existing children', async ({ remdo }) => {
    await remdo.load('tree');

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

  it('enter at start of nested note inserts previous sibling at same depth', async ({ remdo }) => {
    await remdo.load('tree');

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

  it('enter at end on a leaf note inserts a next sibling and focuses it', async ({ remdo }) => {
    await remdo.load('tree');

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

  it('enter at start when the previous sibling has children inserts a new sibling above and keeps that subtree intact', async ({ remdo }) => {
    await remdo.load('tree-complex');

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

  it('enter in the middle of a note with descendants keeps the subtree on the trailing segment', async ({ remdo }) => {
    await remdo.load('tree-complex');

    await placeCaretAtNote(remdo, 'note2', 2);
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
            text: 'no',
          },
          {
            noteId: newNoteId,
            text: 'Xte2',
            children: [{ noteId: 'note3', text: 'note3' }],
          },
          { noteId: 'note4', text: 'note4' },
        ],
      },
      { noteId: 'note5', text: 'note5' },
      { noteId: 'note6', text: 'note6', children: [{ noteId: 'note7', text: 'note7' }] },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: newNoteId });
  });
});
