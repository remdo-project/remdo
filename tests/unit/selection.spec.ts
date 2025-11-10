import { expect, it } from 'vitest';
import {
  placeCaretAtNoteStart,
  placeCaretAtNoteEnd,
  placeCaretInNote,
  selectNoteRange,
  getSelectionText,
  pressSelectAll,
} from '#tests';

/**
 * Selection Snapping Tests
 * These tests verify that selections automatically snap to whole notes
 * when they cross note boundaries, as described in docs/selection.md
 */

it('selecting text across two notes snaps to whole notes', async ({ lexical }) => {
  lexical.load('flat');

  // Select from start of note1 to middle of note2
  // This should snap to encompass both whole notes
  await selectNoteRange('note1', 'note2', lexical.mutate);

  // Wait for the selection plugin to snap the selection
  await new Promise((resolve) => setTimeout(resolve, 50));

  const selectedText = getSelectionText(lexical.validate);
  expect(selectedText).toBe('note1note2');
});

it('selecting text within a single note does not snap', async ({ lexical }) => {
  lexical.load('flat');

  // Place caret at start and select to middle of the same note
  await placeCaretAtNoteStart('note1', lexical.mutate);

  await lexical.mutate(() => {
    const { $getSelection, $isRangeSelection, $isTextNode } = require('lexical');
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;

    const anchorNode = selection.anchor.getNode();
    if (!$isTextNode(anchorNode)) return;

    // Select first 3 characters
    selection.setTextNodeRange(anchorNode, 0, anchorNode, 3);
  });

  const selectedText = getSelectionText(lexical.validate);
  expect(selectedText).toBe('not');
});

it('selecting text across three notes snaps to all three notes', async ({ lexical }) => {
  lexical.load('flat');

  // Select from note1 to note3
  await selectNoteRange('note1', 'note3', lexical.mutate);

  // Wait for the selection plugin to snap the selection
  await new Promise((resolve) => setTimeout(resolve, 50));

  const selectedText = getSelectionText(lexical.validate);
  expect(selectedText).toBe('note1note2note3');
});

it('selecting text from parent to child snaps to whole notes', async ({ lexical }) => {
  lexical.load('tree'); // tree has note1, note2 (sibling), and note3 (child of note2)

  // Select from note1 to note3 (which is nested under note2)
  await selectNoteRange('note1', 'note3', lexical.mutate);

  // Wait for the selection plugin to snap the selection
  await new Promise((resolve) => setTimeout(resolve, 50));

  const selectedText = getSelectionText(lexical.validate);
  // Should include all three notes
  expect(selectedText).toContain('note1');
  expect(selectedText).toContain('note2');
  expect(selectedText).toContain('note3');
});

/**
 * Progressive Selection Tests
 * These tests verify the Cmd/Ctrl+A progressive selection behavior
 */

it('first Cmd+A selects inline content of current note', async ({ lexical }) => {
  lexical.load('flat');

  // Place caret in note1
  await placeCaretInNote('note1', 2, lexical.mutate);

  // First Cmd+A should select all text in note1
  await pressSelectAll(lexical.editor);

  const selectedText = getSelectionText(lexical.validate);
  expect(selectedText).toBe('note1');
});

it('second Cmd+A selects whole note', async ({ lexical }) => {
  lexical.load('flat');

  await placeCaretInNote('note1', 2, lexical.mutate);

  // First Cmd+A: inline content
  await pressSelectAll(lexical.editor);

  // Second Cmd+A: whole note (should be same as first for notes without children)
  await pressSelectAll(lexical.editor);

  const selectedText = getSelectionText(lexical.validate);
  expect(selectedText).toBe('note1');
});

it('third Cmd+A extends to note with descendants', async ({ lexical }) => {
  lexical.load('tree'); // note1, note2, note3 (child of note2)

  // Place caret in note2 which has a child
  await placeCaretInNote('note2', 2, lexical.mutate);

  // First Cmd+A: inline content of note2
  await pressSelectAll(lexical.editor);
  let selectedText = getSelectionText(lexical.validate);
  expect(selectedText).toBe('note2');

  // Second Cmd+A: whole note2
  await pressSelectAll(lexical.editor);

  // Third Cmd+A: note2 plus its descendants (note3)
  await pressSelectAll(lexical.editor);

  selectedText = getSelectionText(lexical.validate);
  expect(selectedText).toContain('note2');
  expect(selectedText).toContain('note3');
});

it('fourth Cmd+A selects all siblings at same level', async ({ lexical }) => {
  lexical.load('flat'); // note1, note2, note3 all at root level

  await placeCaretInNote('note2', 2, lexical.mutate);

  // First Cmd+A: inline content
  await pressSelectAll(lexical.editor);

  // Second Cmd+A: whole note
  await pressSelectAll(lexical.editor);

  // Third Cmd+A: note with descendants (same as second for flat notes)
  await pressSelectAll(lexical.editor);

  // Fourth Cmd+A: all siblings at root level
  await pressSelectAll(lexical.editor);

  const selectedText = getSelectionText(lexical.validate);
  expect(selectedText).toContain('note1');
  expect(selectedText).toContain('note2');
  expect(selectedText).toContain('note3');
});

it('progressive selection resets after caret movement', async ({ lexical }) => {
  lexical.load('flat');

  await placeCaretInNote('note1', 2, lexical.mutate);

  // First Cmd+A: select inline content
  await pressSelectAll(lexical.editor);
  let selectedText = getSelectionText(lexical.validate);
  expect(selectedText).toBe('note1');

  // Move caret (this should reset progression)
  await placeCaretInNote('note2', 2, lexical.mutate);

  // Next Cmd+A should start from beginning again (select inline content of note2)
  await pressSelectAll(lexical.editor);
  selectedText = getSelectionText(lexical.validate);
  expect(selectedText).toBe('note2');
});

it('progressive selection at nested note climbs up to parent', async ({ lexical }) => {
  lexical.load('tree'); // note1, note2, note3 (child of note2)

  // Place caret in note3 (nested child)
  await placeCaretInNote('note3', 2, lexical.mutate);

  // First Cmd+A: inline content of note3
  await pressSelectAll(lexical.editor);
  let selectedText = getSelectionText(lexical.validate);
  expect(selectedText).toBe('note3');

  // Keep pressing Cmd+A to expand selection
  await pressSelectAll(lexical.editor); // whole note3
  await pressSelectAll(lexical.editor); // note3 with descendants
  await pressSelectAll(lexical.editor); // siblings at same level (only note3 at its level)
  await pressSelectAll(lexical.editor); // parent (note2) with descendants

  selectedText = getSelectionText(lexical.validate);
  expect(selectedText).toContain('note2');
  expect(selectedText).toContain('note3');
});

/**
 * Selection State Tests
 * These tests verify that selection maintains proper states
 */

it('selection within note maintains caret state', async ({ lexical }) => {
  lexical.load('flat');

  await placeCaretInNote('note1', 2, lexical.mutate);

  // Verify selection is in the note
  const selectedText = getSelectionText(lexical.validate);
  expect(selectedText).toBe(''); // No text selected, just a caret
});

it('selecting entire note content results in text range state', async ({ lexical }) => {
  lexical.load('flat');

  await placeCaretAtNoteStart('note1', lexical.mutate);

  // Select all text in note1
  await lexical.mutate(() => {
    const { $getSelection, $isRangeSelection, $isTextNode } = require('lexical');
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;

    const anchorNode = selection.anchor.getNode();
    if (!$isTextNode(anchorNode)) return;

    const length = anchorNode.getTextContentSize?.() ?? anchorNode.getTextContent().length;
    selection.setTextNodeRange(anchorNode, 0, anchorNode, length);
  });

  const selectedText = getSelectionText(lexical.validate);
  expect(selectedText).toBe('note1');
});

it('selecting multiple notes results in note range state', async ({ lexical }) => {
  lexical.load('flat');

  await selectNoteRange('note1', 'note2', lexical.mutate);

  // Wait for snapping
  await new Promise((resolve) => setTimeout(resolve, 50));

  const selectedText = getSelectionText(lexical.validate);
  expect(selectedText).toBe('note1note2');
});

/**
 * Edge Cases
 */

it('selection snapping works with complex tree structure', async ({ lexical }) => {
  lexical.load('tree_complex');

  // Get the outline to understand structure
  const { readOutline } = require('#tests');
  const outline = readOutline(lexical.validate);

  // If the fixture has multiple top-level notes, select across them
  if (outline.length >= 2) {
    const firstNote = outline[0]?.text;
    const secondNote = outline[1]?.text;

    if (firstNote && secondNote) {
      await selectNoteRange(firstNote, secondNote, lexical.mutate);

      // Wait for snapping
      await new Promise((resolve) => setTimeout(resolve, 50));

      const selectedText = getSelectionText(lexical.validate);
      expect(selectedText).toContain(firstNote);
      expect(selectedText).toContain(secondNote);
    }
  }
});

it('progressive selection handles single root note', async ({ lexical }) => {
  lexical.load('tree'); // Has note1, note2, note3 where note3 is child of note2

  await placeCaretInNote('note1', 2, lexical.mutate);

  // Press Cmd+A multiple times
  await pressSelectAll(lexical.editor); // inline content
  await pressSelectAll(lexical.editor); // whole note
  await pressSelectAll(lexical.editor); // with descendants
  await pressSelectAll(lexical.editor); // siblings

  // Should eventually select all content at root level
  const selectedText = getSelectionText(lexical.validate);
  expect(selectedText).toContain('note1');
  expect(selectedText).toContain('note2');
});
