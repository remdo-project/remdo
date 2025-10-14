import { expect, it } from 'vitest';
import { pressTab } from './helpers/keyboard';
import { placeCaretAtNoteEnd, placeCaretAtNoteStart, placeCaretInNote, readOutline } from './helpers/note';

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
