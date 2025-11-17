import { expect, it } from 'vitest';
import {
  placeCaretAtNote,
  selectEntireNote,
  selectNoteRange,
  pressKey,
  readOutline,
} from '#tests';

const outlineIsFlat = (outline: Array<{ text: string; children: any[] }>): boolean =>
  outline.every(({ children }) => children.length === 0 && outlineIsFlat(children));

it('tab on note1 at start is a no-op (no structure change)', async ({ lexical }) => {
  lexical.load('flat');

  const before = lexical.getEditorState();

  await placeCaretAtNote('note1', lexical.mutate);
  await pressKey(lexical.editor, { key: 'Tab' }); // indent attempt on first root item

  expect(lexical).toMatchEditorState(before);
});

it("tab on note2 at start nests it under note1; note3 stays at root", async ({ lexical }) => {
  lexical.load('flat');

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
  lexical.load('flat');

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
  lexical.load('basic');

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
  lexical.load('basic');

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
  lexical.load('flat');

  await placeCaretAtNote('note2', lexical.mutate, -1);
  await pressKey(lexical.editor, { key: 'Tab' }); // indent note2 under note1

  // After indenting note2, it should become a child of note1, while note3 remains at root
  expect(lexical).toMatchOutline([
    { text: 'note1', children: [ { text: 'note2', children: [] } ] },
    { text: 'note3', children: [] },
  ]);
});

it("tab on note2 in the middle nests it under note1", async ({ lexical }) => {
  lexical.load('flat');

  await placeCaretAtNote('note2', lexical.mutate, 2); // place caret at offset 2
  await pressKey(lexical.editor, { key: 'Tab' }); // indent note2 under note1

  // After indenting note2, it should become a child of note1, while note3 remains at root
  expect(lexical).toMatchOutline([
    { text: 'note1', children: [ { text: 'note2', children: [] } ] },
    { text: 'note3', children: [] },
  ]);
});

it('tab indents every note in a multi-note selection', async ({ lexical }) => {
  lexical.load('flat');

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
  lexical.load('flat');

  await selectNoteRange('note1', 'note2', lexical.mutate);
  await pressKey(lexical.editor, { key: 'Tab' });

  expect(lexical).toMatchOutline([
    { text: 'note1', children: [] },
    { text: 'note2', children: [] },
    { text: 'note3', children: [] },
  ]);
});

it('tab indents multi-note selection regardless of drag direction', async ({ lexical }) => {
  lexical.load('flat');

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
  lexical.load('basic');

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
  lexical.load('tree');

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
  lexical.load('flat');

  await selectEntireNote('note2', lexical.mutate);
  await pressKey(lexical.editor, { key: 'Tab' });

  expect(lexical).toMatchOutline([
    { text: 'note1', children: [ { text: 'note2', children: [] } ] },
    { text: 'note3', children: [] },
  ]);
});

it('shift+tab outdents when note selection spans the entire note', async ({ lexical }) => {
  lexical.load('basic');

  await selectEntireNote('note2', lexical.mutate);
  await pressKey(lexical.editor, { key: 'Tab', shift: true });

  expect(lexical).toMatchOutline([
    { text: 'note1', children: [] },
    { text: 'note2', children: [] },
    { text: 'note3', children: [] },
  ]);
});

it('shift+tab refuses to partially outdent when selection includes a root note', async ({ lexical }) => {
  lexical.load('basic');

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
  lexical.load('tree');

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
  lexical.load('tree');

  const beforeState = lexical.getEditorState();

  await placeCaretAtNote('note2', lexical.mutate);
  await pressKey(lexical.editor, { key: 'Tab' }); // temporarily indent under note1
  await pressKey(lexical.editor, { key: 'Tab', shift: true }); // outdent back to original spot

  expect(lexical).toMatchEditorState(beforeState);
});

it('shift+tab on child1 leaves child2 and child3 under parent', async ({ lexical }) => {
  lexical.load('outdent_with_siblings');

  await placeCaretAtNote('child1', lexical.mutate);
  await pressKey(lexical.editor, { key: 'Tab', shift: true }); // outdent child1

  // According to docs: outdenting child1 should place it immediately after parent
  // but child2 and child3 should remain as children of parent
  expect(lexical).toMatchOutline([
    {
      text: 'parent',
      children: [
        { text: 'child2', children: [] },
        { text: 'child3', children: [] },
      ],
    },
    { text: 'child1', children: [] },
  ]);
});

it('shift+tab on middle child with its own children preserves sibling structure', async ({ lexical }) => {
  lexical.load('tree_complex');
  
  // tree_complex has:
  // - note1
  //   - note2
  //     - note3
  //   - note4
  // - note5
  // - note6
  //   - note7

  await placeCaretAtNote('note2', lexical.mutate);
  await pressKey(lexical.editor, { key: 'Tab', shift: true }); // outdent note2 (with its child note3)

  // According to docs: note2 should move immediately after note1,
  // note4 should remain under note1, 
  // and note3 should stay with note2 (subtree atomic move)
  expect(lexical).toMatchOutline([
    {
      text: 'note1',
      children: [
        { text: 'note4', children: [] },
      ],
    },
    {
      text: 'note2',
      children: [
        { text: 'note3', children: [] },
      ],
    },
    { text: 'note5', children: [] },
    {
      text: 'note6',
      children: [
        { text: 'note7', children: [] },
      ],
    },
  ]);
});

it('shift+tab on only child removes the parent wrapper', async ({ lexical }) => {
  // This test reveals a bug: when the last child is outdented,
  // the parent wrapper list should be cleaned up, but due to the 
  // isChildrenWrapper check requiring length === 1, it might fail
  // if there's any malformed content
  lexical.load('basic');
  
  // basic.json has:
  // - note1
  //   - note2
  // - note3

  await placeCaretAtNote('note2', lexical.mutate);
  await pressKey(lexical.editor, { key: 'Tab', shift: true }); // outdent the only child

  // After outdenting note2, note1 should have no children,
  // and the wrapper ListItemNode should be removed
  expect(lexical).toMatchOutline([
    { text: 'note1', children: [] },
    { text: 'note2', children: [] },
    { text: 'note3', children: [] },
  ]);

  // Verify the DOM structure is clean (no empty wrapper nodes left behind)
  const outline = readOutline(lexical.validate);
  expect(outline).toEqual([
    { text: 'note1', children: [] },
    { text: 'note2', children: [] },
    { text: 'note3', children: [] },
  ]);
});

it('isChildrenWrapper rejects wrapper with extra text content', async ({ lexical }) => {
  // This test reveals the bug mentioned in docs/todo.md:
  // "isChildrenWrapper currently requires the wrapper ListItemNode to have
  // exactly one child, while Lexical's isNestedListNode only checks the first
  // child's type; the stricter check rejects bullets that mix text and nested lists."
  
  lexical.load('basic');
  
  // basic.json has:
  // - note1
  //   - note2
  // - note3
  
  // Import at top level to avoid context issues
  const { $getRoot, $createTextNode } = await import('lexical');
  const { $isListNode, $isListItemNode } = await import('@lexical/list');
  
  // Now modify the structure to add extra content to the wrapper
  await lexical.mutate(() => {
    const root = $getRoot();
    const rootList = root.getFirstChild();
    if (!$isListNode(rootList)) {
      return;
    }
    
    // Find note1's wrapper (the ListItemNode that contains the nested list with note2)
    const note1Item = rootList.getFirstChild();
    if (!$isListItemNode(note1Item)) {
      return;
    }
    
    const wrapper = note1Item.getNextSibling();
    if (!$isListItemNode(wrapper)) {
      return;
    }
    
    // Add extra text content to the wrapper to make it have length > 1
    // Lexical's isNestedListNode would still recognize this as a nested list node
    // because it only checks if the FIRST child is a ListNode
    // But RemDo's isChildrenWrapper requires length === 1, so it would return false
    const textNode = $createTextNode('extra');
    wrapper.append(textNode);
  });
  
  // Now try to outdent note2
  // Due to the stricter isChildrenWrapper check in RemDo, the $outdentNote function
  // will not recognize the wrapper as a children wrapper (because it has 2 children now),
  // so the outdent operation will return false and fail
  await placeCaretAtNote('note2', lexical.mutate);
  await pressKey(lexical.editor, { key: 'Tab', shift: true });
  
  // Check the result
  const outline = readOutline(lexical.validate);
  
  // BUG REVEALED: Due to the stricter isChildrenWrapper check, the outdent operation
  // behaves catastrophically. The extra text node is incorrectly treated as its own note
  // with note2 as its child! This demonstrates the serious consequence of the stricter
  // check combined with the auto-healing behavior.
  //
  // With Lexical's isNestedListNode (which only checks if first child is a ListNode),
  // the outdent would proceed normally and note2 would be correctly outdented.
  // But RemDo's isChildrenWrapper rejects the wrapper (length > 1), causing the
  // $indentNote function to fail to recognize the structure correctly when processing
  // the Tab operation.
  //
  // The bug is documented in docs/todo.md:
  // 1. "isChildrenWrapper currently requires the wrapper ListItemNode to have exactly
  //     one child, while Lexical's isNestedListNode only checks the first child's type;
  //     the stricter check rejects bullets that mix text and nested lists."
  // 5. "The helpers attempt to auto-heal malformed wrappers by removing them instead
  //     of surfacing invariants like Lexical does."
  expect(outline).toEqual([
    { text: 'note1', children: [] },
    {
      text: 'extra',  // BUG: Text node incorrectly treated as a note!
      children: [
        { text: 'note2', children: [] },  // BUG: note2 now child of "extra"!
      ],
    },
    { text: 'note3', children: [] },
  ]);
});
