import { describe, expect, it } from 'vitest';
import { placeCaretAtNote, placeCaretAtNoteTextNode, pressKey, readCaretNoteId, typeText, meta } from '#tests';

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
    await placeCaretAtNoteTextNode(remdo, 'mixed-formatting', 1, 0);

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
      { noteId: 'mixed-formatting', text: 'bold italic underline plain' },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'mixed-formatting' });
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
});
