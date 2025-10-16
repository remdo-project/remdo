import { expect, it } from 'vitest';
import { pressTab } from './helpers/keyboard';
import { placeCaretAtNoteEnd, placeCaretAtNoteStart, placeCaretInNote, readOutline } from './helpers/note';

const outlineIsFlat = (outline: Array<{ text: string; children: any[] }>): boolean =>
  outline.every(({ children }) => children.length === 0 && outlineIsFlat(children));

it('tab on note0 at start is a no-op (no structure change)', async ({ lexical }) => {
  lexical.load('flat');

  const before = readOutline(lexical.validate);

  await placeCaretAtNoteStart('note0', lexical.mutate);
  await pressTab(lexical.editor); // indent attempt on first root item

  const after = readOutline(lexical.validate);
  expect(after).toEqual(before);
});

it("tab on note1 at start nests it under note0; note2 stays at root", async ({ lexical }) => {
  lexical.load('flat');

  await placeCaretAtNoteStart('note1', lexical.mutate);
  await pressTab(lexical.editor); // indent note1 under note0

  const outline = readOutline(lexical.validate);

  // Expectation assumes the flat fixture has three items: note0, note1, note2
  // After indenting note1, it should become a child of note0, while note2 remains at root
  expect(outline).toEqual([
    { text: 'note0', children: [ { text: 'note1', children: [] } ] },
    { text: 'note2', children: [] },
  ]);
});

it("tab on both note1 and note2 nests them both under note0", async ({ lexical }) => {
  lexical.load('flat');

  await placeCaretAtNoteStart('note1', lexical.mutate);
  await pressTab(lexical.editor); // indent note1 under note0

  await placeCaretAtNoteStart('note2', lexical.mutate);
  await pressTab(lexical.editor); // indent note2 under note0

  const outline = readOutline(lexical.validate);

  // After indenting both note1 and note2, they should both be children of note0
  expect(outline).toEqual([
    {
      text: 'note0',
      children: [
        { text: 'note1', children: [] },
        { text: 'note2', children: [] },
      ],
    },
  ]);
});

it("shift+tab on a child outdents it to root level", async ({ lexical }) => {
  lexical.load('basic');

  await placeCaretAtNoteStart('note00', lexical.mutate);
  await pressTab(lexical.editor, { shift: true }); // outdent child

  const outline = readOutline(lexical.validate);

  // After outdenting the child, it should be at the same level as its former parent and siblings
  expect(outline).toEqual([
    { text: 'note0', children: [] },
    { text: 'note00', children: [] },
    { text: 'note1', children: [] },
  ]);
});

it('shift+tab on note00 flattens the outline', async ({ lexical }) => {
  lexical.load('basic');

  await placeCaretAtNoteStart('note00', lexical.mutate);
  await pressTab(lexical.editor, { shift: true });

  const outline = readOutline(lexical.validate);
  expect(outline).toEqual([
    { text: 'note0', children: [] },
    { text: 'note00', children: [] },
    { text: 'note1', children: [] },
  ]);
  expect(outlineIsFlat(outline)).toBe(true);
});

it("tab on note1 at end nests it under note0", async ({ lexical }) => {
  lexical.load('flat');

  await placeCaretAtNoteEnd('note1', lexical.mutate);
  await pressTab(lexical.editor); // indent note1 under note0

  const outline = readOutline(lexical.validate);

  // After indenting note1, it should become a child of note0, while note2 remains at root
  expect(outline).toEqual([
    { text: 'note0', children: [ { text: 'note1', children: [] } ] },
    { text: 'note2', children: [] },
  ]);
});

it("tab on note1 in the middle nests it under note0", async ({ lexical }) => {
  lexical.load('flat');

  await placeCaretInNote('note1', 2, lexical.mutate); // place caret at offset 2
  await pressTab(lexical.editor); // indent note1 under note0

  const outline = readOutline(lexical.validate);

  // After indenting note1, it should become a child of note0, while note2 remains at root
  expect(outline).toEqual([
    { text: 'note0', children: [ { text: 'note1', children: [] } ] },
    { text: 'note2', children: [] },
  ]);
});

it("tab on note1 at start moves it with its child note2 under note0", async ({ lexical }) => {
  lexical.load('tree');

  await placeCaretAtNoteStart('note1', lexical.mutate);
  await pressTab(lexical.editor); // indent note1 (with its child note2) under note0

  const outline = readOutline(lexical.validate);

  // After indenting note1, it should become a child of note0, and note2 should remain a child of note1
  expect(outline).toEqual([
    {
      text: 'note0',
      children: [
        {
          text: 'note1',
          children: [
            { text: 'note2', children: [] },
          ],
        },
      ],
    },
  ]);
});

it('tab then shift+tab on note1 keeps the tree outline intact', async ({ lexical }) => {
  lexical.load('tree');

  const before = readOutline(lexical.validate);

  await placeCaretAtNoteStart('note1', lexical.mutate);
  await pressTab(lexical.editor); // temporarily indent under note0
  await pressTab(lexical.editor, { shift: true }); // outdent back to original spot

  const after = readOutline(lexical.validate);
  expect(after).toEqual(before);
});
