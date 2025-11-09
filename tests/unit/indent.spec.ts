import { expect, it } from 'vitest';
import {
  placeCaretAtNoteEnd,
  placeCaretAtNoteStart,
  placeCaretInNote,
  selectEntireNote,
  pressTab,
  readOutline,
} from '#tests';

const outlineIsFlat = (outline: Array<{ text: string; children: any[] }>): boolean =>
  outline.every(({ children }) => children.length === 0 && outlineIsFlat(children));

it('tab on note1 at start is a no-op (no structure change)', async ({ lexical }) => {
  lexical.load('flat');

  const before = lexical.getEditorState();

  await placeCaretAtNoteStart('note1', lexical.mutate);
  await pressTab(lexical.editor); // indent attempt on first root item

  expect(lexical).toMatchEditorState(before);
});

it("tab on note2 at start nests it under note1; note3 stays at root", async ({ lexical }) => {
  lexical.load('flat');

  await placeCaretAtNoteStart('note2', lexical.mutate);
  await pressTab(lexical.editor); // indent note2 under note1

  // Expectation assumes the flat fixture has three items: note1, note2, note3
  // After indenting note2, it should become a child of note1, while note3 remains at root
  expect(lexical).toMatchOutline([
    { text: 'note1', children: [ { text: 'note2', children: [] } ] },
    { text: 'note3', children: [] },
  ]);
});

it("tab on both note2 and note3 nests them both under note1", async ({ lexical }) => {
  lexical.load('flat');

  await placeCaretAtNoteStart('note2', lexical.mutate);
  await pressTab(lexical.editor); // indent note2 under note1

  await placeCaretAtNoteStart('note3', lexical.mutate);
  await pressTab(lexical.editor); // indent note3 under note1

  // After indenting both note2 and note3, they should both be children of note1
  expect(lexical).toMatchOutline([
    {
      text: 'note1',
      children: [
        { text: 'note2', children: [] },
        { text: 'note3', children: [] },
      ],
    },
  ]);
});

it("shift+tab on a child outdents it to root level", async ({ lexical }) => {
  lexical.load('basic');

  await placeCaretAtNoteStart('note2', lexical.mutate);
  await pressTab(lexical.editor, { shift: true }); // outdent child

  // After outdenting the child, it should be at the same level as its former parent and siblings
  expect(lexical).toMatchOutline([
    { text: 'note1', children: [] },
    { text: 'note2', children: [] },
    { text: 'note3', children: [] },
  ]);
});

it('shift+tab on note2 flattens the outline', async ({ lexical }) => {
  lexical.load('basic');

  await placeCaretAtNoteStart('note2', lexical.mutate);
  await pressTab(lexical.editor, { shift: true });

  const outline = readOutline(lexical.validate);
  expect(lexical).toMatchOutline([
    { text: 'note1', children: [] },
    { text: 'note2', children: [] },
    { text: 'note3', children: [] },
  ]);
  expect(outlineIsFlat(outline)).toBe(true);
});

it("tab on note2 at end nests it under note1", async ({ lexical }) => {
  lexical.load('flat');

  await placeCaretAtNoteEnd('note2', lexical.mutate);
  await pressTab(lexical.editor); // indent note2 under note1

  // After indenting note2, it should become a child of note1, while note3 remains at root
  expect(lexical).toMatchOutline([
    { text: 'note1', children: [ { text: 'note2', children: [] } ] },
    { text: 'note3', children: [] },
  ]);
});

it("tab on note2 in the middle nests it under note1", async ({ lexical }) => {
  lexical.load('flat');

  await placeCaretInNote('note2', 2, lexical.mutate); // place caret at offset 2
  await pressTab(lexical.editor); // indent note2 under note1

  // After indenting note2, it should become a child of note1, while note3 remains at root
  expect(lexical).toMatchOutline([
    { text: 'note1', children: [ { text: 'note2', children: [] } ] },
    { text: 'note3', children: [] },
  ]);
});

it('tab indents when note text selection spans the entire note', async ({ lexical }) => {
  lexical.load('flat');

  await selectEntireNote('note2', lexical.mutate);
  await pressTab(lexical.editor);

  expect(lexical).toMatchOutline([
    { text: 'note1', children: [ { text: 'note2', children: [] } ] },
    { text: 'note3', children: [] },
  ]);
});

it('shift+tab outdents when note selection spans the entire note', async ({ lexical }) => {
  lexical.load('basic');

  await selectEntireNote('note2', lexical.mutate);
  await pressTab(lexical.editor, { shift: true });

  expect(lexical).toMatchOutline([
    { text: 'note1', children: [] },
    { text: 'note2', children: [] },
    { text: 'note3', children: [] },
  ]);
});

it("tab on note2 at start moves it with its child note3 under note1", async ({ lexical }) => {
  lexical.load('tree');

  await placeCaretAtNoteStart('note2', lexical.mutate);
  await pressTab(lexical.editor); // indent note2 (with its child note3) under note1

  // After indenting note2, it should become a child of note1, and note3 should remain a child of note2
  expect(lexical).toMatchOutline([
    {
      text: 'note1',
      children: [
        {
          text: 'note2',
          children: [
            { text: 'note3', children: [] },
          ],
        },
      ],
    },
  ]);
});

it('tab then shift+tab on note2 keeps the tree outline intact', async ({ lexical }) => {
  lexical.load('tree');

  const beforeState = lexical.getEditorState();

  await placeCaretAtNoteStart('note2', lexical.mutate);
  await pressTab(lexical.editor); // temporarily indent under note1
  await pressTab(lexical.editor, { shift: true }); // outdent back to original spot

  expect(lexical).toMatchEditorState(beforeState);
});
