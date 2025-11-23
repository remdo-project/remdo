import { expect, it } from 'vitest';
import {
  placeCaretAtNote,
  selectEntireNote,
  selectNoteRange,
  pressKey,
  readOutline,
} from '#tests';
import type { Outline } from '#tests';

const outlineIsFlat = (outline: Outline): boolean =>
  outline.every(({ children }) => children.length === 0 && outlineIsFlat(children));

it('tab on note1 at start is a no-op (no structure change)', async ({ lexical }) => {
  await lexical.load('flat');

  const before = lexical.getEditorState();

  await placeCaretAtNote('note1', lexical.mutate);
  await pressKey(lexical.editor, { key: 'Tab' }); // indent attempt on first root item

  expect(lexical).toMatchEditorState(before);
});

it("tab on note2 at start nests it under note1; note3 stays at root", async ({ lexical }) => {
  await lexical.load('flat');

  await placeCaretAtNote('note2', lexical.mutate);
  await pressKey(lexical.editor, { key: 'Tab' }); // indent note2 under note1

  // Expectation assumes the flat fixture has three items: note1, note2, note3
  // After indenting note2, it should become a child of note1, while note3 remains at root
  expect(lexical).toMatchOutline([
    { text: 'note1', children: [ { text: 'note2', children: [] } ] },
    { text: 'note3', children: [] },
  ]);
});

it("tab on both note2 and note3 nests them both under note1", async ({ lexical }) => {
  await lexical.load('flat');

  await placeCaretAtNote('note2', lexical.mutate);
  await pressKey(lexical.editor, { key: 'Tab' }); // indent note2 under note1

  await placeCaretAtNote('note3', lexical.mutate);
  await pressKey(lexical.editor, { key: 'Tab' }); // indent note3 under note1

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
  await lexical.load('basic');

  await placeCaretAtNote('note2', lexical.mutate);
  await pressKey(lexical.editor, { key: 'Tab', shift: true }); // outdent child

  // After outdenting the child, it should be at the same level as its former parent and siblings
  expect(lexical).toMatchOutline([
    { text: 'note1', children: [] },
    { text: 'note2', children: [] },
    { text: 'note3', children: [] },
  ]);
});

it('shift+tab on note2 flattens the outline', async ({ lexical }) => {
  await lexical.load('basic');

  await placeCaretAtNote('note2', lexical.mutate);
  await pressKey(lexical.editor, { key: 'Tab', shift: true });

  const outline = readOutline(lexical.validate);
  expect(lexical).toMatchOutline([
    { text: 'note1', children: [] },
    { text: 'note2', children: [] },
    { text: 'note3', children: [] },
  ]);
  expect(outlineIsFlat(outline)).toBe(true);
});

it("tab on note2 at end nests it under note1", async ({ lexical }) => {
  await lexical.load('flat');

  await placeCaretAtNote('note2', lexical.mutate, -1);
  await pressKey(lexical.editor, { key: 'Tab' }); // indent note2 under note1

  // After indenting note2, it should become a child of note1, while note3 remains at root
  expect(lexical).toMatchOutline([
    { text: 'note1', children: [ { text: 'note2', children: [] } ] },
    { text: 'note3', children: [] },
  ]);
});

it("tab on note2 in the middle nests it under note1", async ({ lexical }) => {
  await lexical.load('flat');

  await placeCaretAtNote('note2', lexical.mutate, 2); // place caret at offset 2
  await pressKey(lexical.editor, { key: 'Tab' }); // indent note2 under note1

  // After indenting note2, it should become a child of note1, while note3 remains at root
  expect(lexical).toMatchOutline([
    { text: 'note1', children: [ { text: 'note2', children: [] } ] },
    { text: 'note3', children: [] },
  ]);
});

it('tab indents every note in a multi-note selection', async ({ lexical }) => {
  await lexical.load('flat');

  await selectNoteRange('note2', 'note3', lexical.mutate);
  await pressKey(lexical.editor, { key: 'Tab' });

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

it('tab on a multi-note selection starting at the first root note is a no-op', async ({ lexical }) => {
  await lexical.load('flat');

  await selectNoteRange('note1', 'note2', lexical.mutate);
  await pressKey(lexical.editor, { key: 'Tab' });

  expect(lexical).toMatchOutline([
    { text: 'note1', children: [] },
    { text: 'note2', children: [] },
    { text: 'note3', children: [] },
  ]);
});

it('tab indents multi-note selection regardless of drag direction', async ({ lexical }) => {
  await lexical.load('flat');

  await selectNoteRange('note3', 'note2', lexical.mutate);
  await pressKey(lexical.editor, { key: 'Tab' });

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

it('tab refuses to indent a selection whose leading child lacks a previous sibling', async ({ lexical }) => {
  await lexical.load('basic');

  await placeCaretAtNote('note3', lexical.mutate);
  await pressKey(lexical.editor, { key: 'Tab' });

  await selectNoteRange('note2', 'note3', lexical.mutate);
  await pressKey(lexical.editor, { key: 'Tab' });

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

it('tab indents a subtree selection even when a child lacks its own previous sibling', async ({ lexical }) => {
  await lexical.load('tree');

  await selectNoteRange('note2', 'note3', lexical.mutate);
  await pressKey(lexical.editor, { key: 'Tab' });

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

it('tab indents when note text selection spans the entire note', async ({ lexical }) => {
  await lexical.load('flat');

  await selectEntireNote('note2', lexical.mutate);
  await pressKey(lexical.editor, { key: 'Tab' });

  expect(lexical).toMatchOutline([
    { text: 'note1', children: [ { text: 'note2', children: [] } ] },
    { text: 'note3', children: [] },
  ]);
});

it('shift+tab outdents when note selection spans the entire note', async ({ lexical }) => {
  await lexical.load('basic');

  await selectEntireNote('note2', lexical.mutate);
  await pressKey(lexical.editor, { key: 'Tab', shift: true });

  expect(lexical).toMatchOutline([
    { text: 'note1', children: [] },
    { text: 'note2', children: [] },
    { text: 'note3', children: [] },
  ]);
});

it('shift+tab refuses to partially outdent when selection includes a root note', async ({ lexical }) => {
  await lexical.load('basic');

  await selectNoteRange('note1', 'note2', lexical.mutate);
  await pressKey(lexical.editor, { key: 'Tab', shift: true });

  expect(lexical).toMatchOutline([
    {
      text: 'note1',
      children: [
        { text: 'note2', children: [] },
      ],
    },
    { text: 'note3', children: [] },
  ]);
});

it("tab on note2 at start moves it with its child note3 under note1", async ({ lexical }) => {
  await lexical.load('tree');

  await placeCaretAtNote('note2', lexical.mutate);
  await pressKey(lexical.editor, { key: 'Tab' }); // indent note2 (with its child note3) under note1

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
  await lexical.load('tree');

  const beforeState = lexical.getEditorState();

  await placeCaretAtNote('note2', lexical.mutate);
  await pressKey(lexical.editor, { key: 'Tab' }); // temporarily indent under note1
  await pressKey(lexical.editor, { key: 'Tab', shift: true }); // outdent back to original spot

  expect(lexical).toMatchEditorState(beforeState);
});
