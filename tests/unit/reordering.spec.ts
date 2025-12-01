import { describe, it, expect } from 'vitest';
import { placeCaretAtNote, selectNoteRange, pressKey } from '#tests';

const macChordDown = { key: 'ArrowDown', ctrl: true, shift: true } as const;
const macChordUp = { key: 'ArrowUp', ctrl: true, shift: true } as const;

describe('keyboard reordering (TODO)', () => {
  it.fails('move down swaps with next sibling within the same parent (mac chord)', async ({ lexical }) => {
    await lexical.load('flat');
    await placeCaretAtNote('note2', lexical.mutate);
    await pressKey(lexical.editor, macChordDown);
    expect(lexical).toMatchOutline([
      { text: 'note1', children: [] },
      { text: 'note3', children: [] },
      { text: 'note2', children: [] },
    ]);
  });

  it.fails('move down from last child reparents to next sibling parent', async ({ lexical }) => {
    await lexical.load('basic');
    await placeCaretAtNote('note2', lexical.mutate);
    await pressKey(lexical.editor, macChordDown);
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

  it.fails('move up from first child with no previous sibling outdents before parent', async ({ lexical }) => {
    await lexical.load('basic');
    await placeCaretAtNote('note2', lexical.mutate);
    await pressKey(lexical.editor, macChordUp);
    expect(lexical).toMatchOutline([
      { text: 'note2', children: [] },
      { text: 'note1', children: [] },
      { text: 'note3', children: [] },
    ]);
  });

  it.fails('move up from first child reparents into previous sibling as last child', async ({ lexical }) => {
    await lexical.load('tree');
    await placeCaretAtNote('note3', lexical.mutate);
    await pressKey(lexical.editor, macChordUp);
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

  it.fails('move commands act on contiguous selection blocks', async ({ lexical }) => {
    await lexical.load('flat');
    await selectNoteRange('note1', 'note2', lexical.mutate);
    await pressKey(lexical.editor, macChordDown);
    expect(lexical).toMatchOutline([
      { text: 'note3', children: [] },
      { text: 'note1', children: [] },
      { text: 'note2', children: [] },
    ]);
  });
});
