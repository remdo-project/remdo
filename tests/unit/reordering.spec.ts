import { describe, it, expect } from 'vitest';
import { placeCaretAtNote, selectNoteRange, readOutline } from '#tests';
import { REORDER_NOTES_DOWN_COMMAND, REORDER_NOTES_UP_COMMAND } from '@/editor/commands';

describe('keyboard reordering (command path)', () => {
  it('move down swaps with next sibling within the same parent', async ({ remdo }) => {
    await remdo.load('flat');
    await placeCaretAtNote(remdo, 'note2');
    await remdo.dispatchCommand(REORDER_NOTES_DOWN_COMMAND);
    expect(remdo).toMatchOutline([
      { text: 'note1' },
      { text: 'note3' },
      { text: 'note2' },
    ]);
  });

  it('move up swaps with previous sibling within the same parent', async ({ remdo }) => {
    await remdo.load('flat');
    await placeCaretAtNote(remdo, 'note3');
    await remdo.dispatchCommand(REORDER_NOTES_UP_COMMAND);
    expect(remdo).toMatchOutline([
      { text: 'note1' },
      { text: 'note3' },
      { text: 'note2' },
    ]);
  });

  it('move down from last child is a no-op at the boundary (level-preserving)', async ({ remdo }) => {
    await remdo.load('basic');
    const outlineBefore = readOutline(remdo);
    await placeCaretAtNote(remdo, 'note3');
    await remdo.dispatchCommand(REORDER_NOTES_DOWN_COMMAND, undefined, { expect: 'noop' });
    expect(remdo).toMatchOutline(outlineBefore);
  });

  it('move up from first child with no previous sibling is a no-op (level-preserving)', async ({ remdo }) => {
    await remdo.load('basic');
    const outlineBefore = readOutline(remdo);
    await placeCaretAtNote(remdo, 'note1');
    await remdo.dispatchCommand(REORDER_NOTES_UP_COMMAND, undefined, { expect: 'noop' });
    expect(remdo).toMatchOutline(outlineBefore);
  });

  it('move down from last child with no next parent is a no-op (level-preserving)', async ({ remdo }) => {
    await remdo.load('tree');
    const outlineBefore = readOutline(remdo);
    await placeCaretAtNote(remdo, 'note3');
    await remdo.dispatchCommand(REORDER_NOTES_DOWN_COMMAND, undefined, { expect: 'noop' });
    expect(remdo).toMatchOutline(outlineBefore);
  });

  it('move up from first child is a no-op at boundary (level-preserving)', async ({ remdo }) => {
    await remdo.load('tree');
    const outlineBefore = readOutline(remdo);
    await placeCaretAtNote(remdo, 'note1');
    await remdo.dispatchCommand(REORDER_NOTES_UP_COMMAND, undefined, { expect: 'noop' });
    expect(remdo).toMatchOutline(outlineBefore);
  });

  it('move commands act on contiguous selection blocks', async ({ remdo }) => {
    await remdo.load('flat');
    await selectNoteRange(remdo, 'note1', 'note2');
    await remdo.dispatchCommand(REORDER_NOTES_DOWN_COMMAND);
    expect(remdo).toMatchOutline([
      { text: 'note3' },
      { text: 'note1' },
      { text: 'note2' },
    ]);
  });

  it('moving a note carries its subtree intact', async ({ remdo }) => {
    await remdo.load('tree');
    await placeCaretAtNote(remdo, 'note1'); // note1 has no children, note3 is nested under note2
    await selectNoteRange(remdo, 'note2', 'note2'); // move note2 which has child note3
    await remdo.dispatchCommand(REORDER_NOTES_UP_COMMAND);
    expect(remdo).toMatchOutline([
      {
        text: 'note2',
        children: [{ text: 'note3' }],
      },
      { text: 'note1' },
    ]);
  });

  it('moving a mixed-depth contiguous range down is a no-op at a boundary (level-preserving)', async ({ remdo }) => {
    await remdo.load('tree-complex');
    const outlineBefore = readOutline(remdo);
    await selectNoteRange(remdo, 'note2', 'note4'); // includes descendant note3
    await remdo.dispatchCommand(REORDER_NOTES_DOWN_COMMAND, undefined, { expect: 'noop' });

    expect(remdo).toMatchOutline(outlineBefore);

    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });
  });

  it('deep nested boundary move down is a no-op (last child at depth)', async ({ remdo }) => {
    await remdo.load('tree-complex');
    // Select nested leaf note3 only; it is the last child of note2
    await selectNoteRange(remdo, 'note3', 'note3');
    const outlineBefore = readOutline(remdo);
    await remdo.dispatchCommand(REORDER_NOTES_DOWN_COMMAND, undefined, { expect: 'noop' });
    expect(remdo).toMatchOutline(outlineBefore);
  });

  it('deep nested boundary move up is a no-op (first child at depth)', async ({ remdo }) => {
    await remdo.load('tree-complex');
    // Select nested leaf note3 only; it is also the first child of note2
    await selectNoteRange(remdo, 'note3', 'note3');
    const outlineBefore = readOutline(remdo);
    await remdo.dispatchCommand(REORDER_NOTES_UP_COMMAND, undefined, { expect: 'noop' });
    expect(remdo).toMatchOutline(outlineBefore);
  });

  it('ancestor-only selection swaps intact with sibling within parent list', async ({ remdo }) => {
    await remdo.load('tree-complex');
    await selectNoteRange(remdo, 'note2', 'note2'); // select ancestor with child note3
    await remdo.dispatchCommand(REORDER_NOTES_DOWN_COMMAND);

    expect(remdo).toMatchOutline([
      {
        text: 'note1',
        children: [{ text: 'note4' }, { text: 'note2', children: [{ text: 'note3' }] }],
      },
      { text: 'note5' },
      { text: 'note6', children: [{ text: 'note7' }] },
    ]);
  });
  it('moving a mixed-depth contiguous range up is a no-op at a boundary (level-preserving)', async ({ remdo }) => {
    await remdo.load('tree-complex');
    const outlineBefore = readOutline(remdo);
    await selectNoteRange(remdo, 'note2', 'note4'); // includes descendant note3
    await remdo.dispatchCommand(REORDER_NOTES_UP_COMMAND, undefined, { expect: 'noop' });

    expect(remdo).toMatchOutline(outlineBefore);

    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });
  });

  it('ignores selections spanning different parents', async ({ remdo }) => {
    await remdo.load('tree');
    await selectNoteRange(remdo, 'note1', 'note3'); // crosses root note and nested child
    await remdo.dispatchCommand(REORDER_NOTES_DOWN_COMMAND, undefined, { expect: 'noop' });
    expect(remdo).toMatchOutline([
      {
        text: 'note1',
      },
      {
        text: 'note2',
        children: [{ text: 'note3' }],
      },
    ]);
  });
});
