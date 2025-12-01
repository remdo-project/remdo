import { describe, it, expect } from 'vitest';
import { placeCaretAtNote, selectNoteRange, pressKey } from '#tests';
import type { LexicalTestHelpers } from '#tests';
import { MOVE_SELECTION_DOWN_COMMAND, MOVE_SELECTION_UP_COMMAND } from '@/editor/commands';

const macChordDown = { key: 'ArrowDown', ctrl: true, shift: true } as const;

describe('keyboard reordering', () => {
  const dispatchMove = (lexical: LexicalTestHelpers, direction: 'up' | 'down') =>
    lexical.mutate(() => {
      const command = direction === 'up' ? MOVE_SELECTION_UP_COMMAND : MOVE_SELECTION_DOWN_COMMAND;
      lexical.editor.dispatchCommand(command);
    });

  it('move down swaps with next sibling within the same parent (mac chord smoke)', async ({ lexical }) => {
    await lexical.load('flat');
    await placeCaretAtNote('note2', lexical.mutate);
    await pressKey(lexical.editor, macChordDown);
    expect(lexical).toMatchOutline([
      { text: 'note1', children: [] },
      { text: 'note3', children: [] },
      { text: 'note2', children: [] },
    ]);
  });

  it('move down from last child reparents to next sibling parent', async ({ lexical }) => {
    await lexical.load('basic');
    await placeCaretAtNote('note2', lexical.mutate);
    await dispatchMove(lexical, 'down');
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
    await dispatchMove(lexical, 'up');
    expect(lexical).toMatchOutline([
      { text: 'note2', children: [] },
      { text: 'note1', children: [] },
      { text: 'note3', children: [] },
    ]);
  });

  it('move up from first child reparents into previous sibling as last child', async ({ lexical }) => {
    await lexical.load('tree');
    await placeCaretAtNote('note3', lexical.mutate);
    await dispatchMove(lexical, 'up');
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
    await dispatchMove(lexical, 'down');
    expect(lexical).toMatchOutline([
      { text: 'note3', children: [] },
      { text: 'note1', children: [] },
      { text: 'note2', children: [] },
    ]);
  });
});
