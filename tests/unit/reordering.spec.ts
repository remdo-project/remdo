import { describe, it, expect } from 'vitest';
import { placeCaretAtNote, selectNoteRange, readOutline } from '#tests';
import { MOVE_SELECTION_DOWN_COMMAND, MOVE_SELECTION_UP_COMMAND } from '@/editor/commands';

describe('keyboard reordering (command path)', () => {
  it('move down swaps with next sibling within the same parent', async ({ lexical }) => {
    await lexical.load('flat');
    await placeCaretAtNote('note2', lexical.mutate);
    await lexical.dispatchCommand(MOVE_SELECTION_DOWN_COMMAND);
    expect(lexical).toMatchOutline([
      { text: 'note1', children: [] },
      { text: 'note3', children: [] },
      { text: 'note2', children: [] },
    ]);
  });

  it('move up swaps with previous sibling within the same parent', async ({ lexical }) => {
    await lexical.load('flat');
    await placeCaretAtNote('note3', lexical.mutate);
    await lexical.dispatchCommand(MOVE_SELECTION_UP_COMMAND);
    expect(lexical).toMatchOutline([
      { text: 'note1', children: [] },
      { text: 'note3', children: [] },
      { text: 'note2', children: [] },
    ]);
  });

  it('move down from last child is a no-op at the boundary (level-preserving)', async ({ lexical }) => {
    await lexical.load('basic');
    const outlineBefore = readOutline(lexical.validate);
    await placeCaretAtNote('note2', lexical.mutate);
    await lexical.dispatchCommand(MOVE_SELECTION_DOWN_COMMAND);
    expect(lexical).toMatchOutline(outlineBefore);
  });

  it('move up from first child with no previous sibling is a no-op (level-preserving)', async ({ lexical }) => {
    await lexical.load('basic');
    const outlineBefore = readOutline(lexical.validate);
    await placeCaretAtNote('note2', lexical.mutate);
    await lexical.dispatchCommand(MOVE_SELECTION_UP_COMMAND);
    expect(lexical).toMatchOutline(outlineBefore);
  });

  it('move down from last child with no next parent is a no-op (level-preserving)', async ({ lexical }) => {
    await lexical.load('tree');
    const outlineBefore = readOutline(lexical.validate);
    await placeCaretAtNote('note3', lexical.mutate);
    await lexical.dispatchCommand(MOVE_SELECTION_DOWN_COMMAND);
    expect(lexical).toMatchOutline(outlineBefore);
  });

  it('move up from first child is a no-op at boundary (level-preserving)', async ({ lexical }) => {
    await lexical.load('tree');
    const outlineBefore = readOutline(lexical.validate);
    await placeCaretAtNote('note3', lexical.mutate);
    await lexical.dispatchCommand(MOVE_SELECTION_UP_COMMAND);
    expect(lexical).toMatchOutline(outlineBefore);
  });

  it('move commands act on contiguous selection blocks', async ({ lexical }) => {
    await lexical.load('flat');
    await selectNoteRange('note1', 'note2', lexical.mutate);
    await lexical.dispatchCommand(MOVE_SELECTION_DOWN_COMMAND);
    expect(lexical).toMatchOutline([
      { text: 'note3', children: [] },
      { text: 'note1', children: [] },
      { text: 'note2', children: [] },
    ]);
  });

  it('moving a note carries its subtree intact', async ({ lexical }) => {
    await lexical.load('tree');
    await placeCaretAtNote('note1', lexical.mutate); // note1 has no children, note3 is nested under note2
    await selectNoteRange('note2', 'note2', lexical.mutate); // move note2 which has child note3
    await lexical.dispatchCommand(MOVE_SELECTION_UP_COMMAND);
    expect(lexical).toMatchOutline([
      {
        text: 'note2',
        children: [{ text: 'note3', children: [] }],
      },
      { text: 'note1', children: [] },
    ]);
  });

  it('moving a mixed-depth contiguous range down is a no-op at a boundary (level-preserving)', async ({ lexical }) => {
    await lexical.load('tree_complex');
    const outlineBefore = readOutline(lexical.validate);
    await selectNoteRange('note2', 'note4', lexical.mutate); // includes descendant note3
    await lexical.dispatchCommand(MOVE_SELECTION_DOWN_COMMAND);

    expect(lexical).toMatchOutline(outlineBefore);

    expect(lexical).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });
  });

  it('deep nested boundary move down is a no-op (last child at depth)', async ({ lexical }) => {
    await lexical.load('tree_complex');
    // Select nested leaf note3 only; it is the last child of note2
    await selectNoteRange('note3', 'note3', lexical.mutate);
    const outlineBefore = readOutline(lexical.validate);
    await lexical.dispatchCommand(MOVE_SELECTION_DOWN_COMMAND);
    expect(lexical).toMatchOutline(outlineBefore);
  });

  it('deep nested boundary move up is a no-op (first child at depth)', async ({ lexical }) => {
    await lexical.load('tree_complex');
    // Select nested leaf note3 only; it is also the first child of note2
    await selectNoteRange('note3', 'note3', lexical.mutate);
    const outlineBefore = readOutline(lexical.validate);
    await lexical.dispatchCommand(MOVE_SELECTION_UP_COMMAND);
    expect(lexical).toMatchOutline(outlineBefore);
  });

  it('ancestor-only selection swaps intact with sibling within parent list', async ({ lexical }) => {
    await lexical.load('tree_complex');
    await selectNoteRange('note2', 'note2', lexical.mutate); // select ancestor with child note3
    await lexical.dispatchCommand(MOVE_SELECTION_DOWN_COMMAND);

    expect(lexical).toMatchOutline([
      {
        text: 'note1',
        children: [{ text: 'note4', children: [] }, { text: 'note2', children: [{ text: 'note3', children: [] }] }],
      },
      { text: 'note5', children: [] },
      { text: 'note6', children: [{ text: 'note7', children: [] }] },
    ]);
  });
  it('moving a mixed-depth contiguous range up is a no-op at a boundary (level-preserving)', async ({ lexical }) => {
    await lexical.load('tree_complex');
    const outlineBefore = readOutline(lexical.validate);
    await selectNoteRange('note2', 'note4', lexical.mutate); // includes descendant note3
    await lexical.dispatchCommand(MOVE_SELECTION_UP_COMMAND);

    expect(lexical).toMatchOutline(outlineBefore);

    expect(lexical).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });
  });

  it('ignores selections spanning different parents', async ({ lexical }) => {
    await lexical.load('tree');
    await selectNoteRange('note1', 'note3', lexical.mutate); // crosses root note and nested child
    await lexical.dispatchCommand(MOVE_SELECTION_DOWN_COMMAND);
    expect(lexical).toMatchOutline([
      {
        text: 'note1',
        children: [],
      },
      {
        text: 'note2',
        children: [{ text: 'note3', children: [] }],
      },
    ]);
  });
});
