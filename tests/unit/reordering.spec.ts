import { describe, it, expect } from 'vitest';
import { placeCaretAtNote, selectNoteRange } from '#tests';
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

  it('move down from last child reparents to next sibling parent', async ({ lexical }) => {
    await lexical.load('basic');
    await placeCaretAtNote('note2', lexical.mutate);
    await lexical.dispatchCommand(MOVE_SELECTION_DOWN_COMMAND);
    expect(lexical).toMatchOutline([
      {
        text: 'note1',
        children: [],
      },
      {
        text: 'note3',
        children: [{ text: 'note2', children: [] }],
      },
    ]);
  });

  it('move up from first child with no previous sibling outdents before parent', async ({ lexical }) => {
    await lexical.load('basic');
    await placeCaretAtNote('note2', lexical.mutate);
    await lexical.dispatchCommand(MOVE_SELECTION_UP_COMMAND);
    expect(lexical).toMatchOutline([
      { text: 'note2', children: [] },
      { text: 'note1', children: [] },
      { text: 'note3', children: [] },
    ]);
  });

  it('move down from last child with no next parent outdents after parent', async ({ lexical }) => {
    await lexical.load('tree');
    await placeCaretAtNote('note3', lexical.mutate);
    await lexical.dispatchCommand(MOVE_SELECTION_DOWN_COMMAND);
    expect(lexical).toMatchOutline([
      { text: 'note1', children: [] },
      { text: 'note2', children: [] },
      { text: 'note3', children: [] },
    ]);
  });

  it('move up from first child reparents into previous sibling as last child', async ({ lexical }) => {
    await lexical.load('tree');
    await placeCaretAtNote('note3', lexical.mutate);
    await lexical.dispatchCommand(MOVE_SELECTION_UP_COMMAND);
    expect(lexical).toMatchOutline([
      {
        text: 'note1',
        children: [{ text: 'note3', children: [] }],
      },
      {
        text: 'note2',
        children: [],
      },
    ]);
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

  it('moving a mixed-depth contiguous range down hoists it under the next parent sibling', async ({ lexical }) => {
    await lexical.load('tree_complex');
    await selectNoteRange('note2', 'note4', lexical.mutate); // includes descendant note3
    await lexical.dispatchCommand(MOVE_SELECTION_DOWN_COMMAND);

    expect(lexical).toMatchOutline([
      { text: 'note1', children: [] },
      {
        text: 'note5',
        children: [
          { text: 'note2', children: [{ text: 'note3', children: [] }] },
          { text: 'note4', children: [] },
        ],
      },
      { text: 'note6', children: [{ text: 'note7', children: [] }] },
    ]);

    expect(lexical).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });
  });

  it('moving a mixed-depth contiguous range up hoists it under the previous parent sibling', async ({ lexical }) => {
    await lexical.load('tree_complex');
    await selectNoteRange('note2', 'note4', lexical.mutate); // includes descendant note3
    await lexical.dispatchCommand(MOVE_SELECTION_UP_COMMAND);

    expect(lexical).toMatchOutline([
      { text: 'note2', children: [{ text: 'note3', children: [] }] },
      { text: 'note4', children: [] },
      {
        text: 'note1',
        children: [],
      },
      { text: 'note5', children: [] },
      { text: 'note6', children: [{ text: 'note7', children: [] }] },
    ]);

    expect(lexical).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });
  });

  it('top boundary move up is a no-op', async ({ lexical }) => {
    await lexical.load('flat');
    await placeCaretAtNote('note1', lexical.mutate);
    lexical.editor.dispatchCommand(MOVE_SELECTION_UP_COMMAND);
    expect(lexical).toMatchOutline([
      { text: 'note1', children: [] },
      { text: 'note2', children: [] },
      { text: 'note3', children: [] },
    ]);
  });

  it('bottom boundary move down is a no-op', async ({ lexical }) => {
    await lexical.load('flat');
    await placeCaretAtNote('note3', lexical.mutate);
    lexical.editor.dispatchCommand(MOVE_SELECTION_DOWN_COMMAND);
    expect(lexical).toMatchOutline([
      { text: 'note1', children: [] },
      { text: 'note2', children: [] },
      { text: 'note3', children: [] },
    ]);
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
