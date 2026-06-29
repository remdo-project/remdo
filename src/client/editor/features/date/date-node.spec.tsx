import { act } from '@testing-library/react';
import dayjs from 'dayjs';
import { $createTextNode, $getSelection, $isNodeSelection, $isRangeSelection, $isTextNode } from 'lexical';
import type { SerializedLexicalNode } from 'lexical';
import { describe, expect, it, vi } from 'vitest';

import { $findNoteById } from '#client/editor/outline/note-traversal';
import type { RemdoTestApi } from '#client/editor/plugins/dev';
import { findSerializedNode, meta, placeCaretAtNote, placeCaretAtNoteTextNode, pressKey, typeText } from '#tests';
import type { SerializedDateNode } from './date-node';
import { $createDateNode, $isDateNode } from './date-node';

function findSerializedDateNode(nodes: SerializedLexicalNode[] | undefined): SerializedDateNode | null {
  return findSerializedNode(nodes, (node): node is SerializedDateNode => node.type === 'date');
}

function getTodayIsoDate(): string {
  return dayjs().format('YYYY-MM-DD');
}

function formatDateLabel(isoDate: string): string {
  return dayjs(isoDate).format('MMM D, YYYY');
}

async function clickElement(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

async function mouseDownElement(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  });
}

async function clickPickerDay(isoDate: string) {
  const day = document.querySelector(`[data-date-picker-day="${isoDate}"]`);
  expect(day).not.toBeNull();
  await clickElement(day!);
}

async function pressSpaceKey(remdo: RemdoTestApi) {
  await act(async () => {
    remdo.editor.getRootElement()!.dispatchEvent(new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    }));
  });
  await remdo.waitForSynced();
}

async function pressKeyOnActiveElement(remdo: RemdoTestApi, key: string) {
  await act(async () => {
    const target = document.activeElement;
    expect(target).toBeInstanceOf(HTMLElement);
    target!.dispatchEvent(new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
    }));
  });
  await remdo.waitForSynced();
}

async function setupInlineDate(remdo: RemdoTestApi) {
  await remdo.mutate(() => {
    const note = $findNoteById('note1')!;
    note.clear();
    note.append($createTextNode('before '), $createDateNode('2026-06-10'), $createTextNode(' after'));
  });
}

async function placeCaretNextToDate(remdo: RemdoTestApi, side: 'after' | 'before') {
  await remdo.mutate(() => {
    const note = $findNoteById('note1')!;
    const dateNode = note.getChildren().find($isDateNode)!;
    const offset = dateNode.getIndexWithinParent() + (side === 'after' ? 1 : 0);
    note.select(offset, offset);
  });
}

function getDateElement(): Element {
  const dateElement = document.querySelector('[data-date-node-key]');
  expect(dateElement).not.toBeNull();
  return dateElement!;
}

function expectDateTokenSelected(remdo: RemdoTestApi) {
  expect(getDateElement()).toHaveAttribute('data-date-token-selected', 'true');
  remdo.validate(() => {
    const selection = $getSelection();
    expect($isNodeSelection(selection)).toBe(true);
    const nodes = $isNodeSelection(selection) ? selection.getNodes() : [];
    expect(nodes).toHaveLength(1);
    expect($isDateNode(nodes[0])).toBe(true);
  });
}

function expectDateBoundarySelection(remdo: RemdoTestApi, side: 'after' | 'before') {
  expect(getDateElement()).not.toHaveAttribute('data-date-token-selected');
  remdo.validate(() => {
    const note = $findNoteById('note1')!;
    const dateNode = note.getChildren().find($isDateNode)!;
    const selection = $getSelection();
    expect($isRangeSelection(selection)).toBe(true);
    if (!$isRangeSelection(selection)) {
      return;
    }
    const offset = side === 'before' ? dateNode.getIndexWithinParent() : dateNode.getIndexWithinParent() + 1;
    expect(selection.isCollapsed()).toBe(true);
    if (selection.anchor.type === 'element') {
      expect(selection.anchor.getNode().getKey()).toBe(note.getKey());
      expect(selection.anchor.offset).toBe(offset);
      return;
    }

    expect(selection.anchor.type).toBe('text');
    const anchorNode = selection.anchor.getNode();
    const adjacentTextNode = side === 'before' ? dateNode.getPreviousSibling() : dateNode.getNextSibling();
    const adjacentOffset = side === 'before' && $isTextNode(adjacentTextNode) ? adjacentTextNode.getTextContentSize() : 0;

    const isAdjacentTextBoundary =
      $isTextNode(adjacentTextNode) &&
      anchorNode.getKey() === adjacentTextNode.getKey() &&
      selection.anchor.offset === adjacentOffset;
    expect(isAdjacentTextBoundary).toBe(true);
  });
}

describe('date nodes', () => {
  it('serializes date identity separately from the readable label', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await remdo.mutate(() => {
      const note = $findNoteById('note1')!;
      note.clear();
      note.append($createDateNode('2026-06-10'));
    });

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const dateNode = note.getChildren().find($isDateNode)!;
      expect(dateNode.getIsoDate()).toBe('2026-06-10');
      expect(dateNode.getTextContent()).toBe('Jun 10, 2026');
      expect($isTextNode(dateNode)).toBe(false);
    });

    const dateNode = findSerializedDateNode(remdo.getEditorState().root.children);
    expect(dateNode).toMatchObject({
      isoDate: '2026-06-10',
      type: 'date',
    });
    expect(dateNode).not.toHaveProperty('text');
    expect(dateNode).not.toHaveProperty('mode');
    expect((getDateElement().closest('[data-lexical-decorator]') as HTMLElement).contentEditable).toBe('false');
  });

  it('round-trips date identity through editor JSON import and export', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await remdo.mutate(() => {
      const note = $findNoteById('note1')!;
      note.clear();
      note.append($createTextNode('before '), $createDateNode('2026-06-10'), $createTextNode(' after'));
    });

    const serialized = remdo.getEditorState();
    expect(findSerializedDateNode(serialized.root.children)).toMatchObject({
      isoDate: '2026-06-10',
      type: 'date',
    });

    await act(async () => {
      const parsed = remdo.editor.parseEditorState(JSON.stringify(serialized));
      remdo.editor.setEditorState(parsed);
    });
    await remdo.waitForSynced();

    const roundTrippedDateNode = findSerializedDateNode(remdo.getEditorState().root.children);
    expect(roundTrippedDateNode).toMatchObject({
      isoDate: '2026-06-10',
      type: 'date',
    });
    expect(roundTrippedDateNode).not.toHaveProperty('text');

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const dateNode = note.getChildren().find($isDateNode)!;
      expect(dateNode.getIsoDate()).toBe('2026-06-10');
      expect(dateNode.getTextContent()).toBe('Jun 10, 2026');
    });
  });

  it('rejects invalid dates when importing editor JSON', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await remdo.mutate(() => {
      const note = $findNoteById('note1')!;
      note.clear();
      note.append($createDateNode('2026-06-10'));
    });

    const serialized = remdo.getEditorState();
    const dateNode = findSerializedDateNode(serialized.root.children)!;
    dateNode.isoDate = '2026-02-30';

    expect(() => {
      remdo.editor.parseEditorState(JSON.stringify(serialized));
    }).toThrow('DateNode isoDate must be a valid YYYY-MM-DD date.');
  });

  it('inserts a date node from the ! picker', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const isoDate = getTodayIsoDate();
    const label = formatDateLabel(isoDate);

    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, ' !');

    expect(document.querySelector('[data-date-picker-mode="insert"]')).not.toBeNull();
    await clickPickerDay(isoDate);

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: `note1 ${label} ` },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const dateNode = note.getChildren().find($isDateNode)!;
      expect(dateNode.getIsoDate()).toBe(isoDate);
      expect(dateNode.getTextContent()).toBe(label);
    });
  });

  it('confirms the ! picker with Tab', meta({ fixture: 'flat' }), async ({ remdo }) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2031-01-02T12:00:00'));

      await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
      await typeText(remdo, ' !');

      expect(document.querySelector('[data-date-picker-mode="insert"]')).not.toBeNull();
      await pressKey(remdo, { key: 'Tab' });

      expect(document.querySelector('[data-date-picker]')).toBeNull();
      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'note1 Jan 2, 2031 ' },
        { noteId: 'note2', text: 'note2' },
        { noteId: 'note3', text: 'note3' },
      ]);

      remdo.validate(() => {
        const note = $findNoteById('note1')!;
        const dateNode = note.getChildren().find($isDateNode)!;
        expect(dateNode.getIsoDate()).toBe('2031-01-02');
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the ! picker open on ArrowDown when the note has a body', meta({ fixture: 'flat' }), async ({ remdo }) => {
    // A note with a body has a body-skip arrow handler; it must defer Up/Down to
    // an open picker rather than consume the key and move the caret past the body
    // (which would close the picker). Regression: the body-skip only deferred for
    // the note-link picker, not the date picker.
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'a body');

    // Open the ! picker at the end of note1's label.
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, ' !');
    expect(document.querySelector('[data-date-picker-mode="insert"]')).not.toBeNull();

    await pressKey(remdo, { key: 'ArrowDown' });
    expect(document.querySelector('[data-date-picker]')).not.toBeNull();
  });

  it('uses the current local date when a long-lived editor opens the ! picker again', meta({ fixture: 'flat' }), async ({ remdo }) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2031-01-01T12:00:00'));
      await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
      await typeText(remdo, ' !');
      expect(document.querySelector('[data-date-picker-mode="insert"]')).not.toBeNull();
      await pressKey(remdo, { key: 'Escape' });

      vi.setSystemTime(new Date('2031-01-02T12:00:00'));
      await typeText(remdo, ' !');
      expect(document.querySelector('[data-date-picker-mode="insert"]')).not.toBeNull();
      await pressKey(remdo, { key: 'Enter' });

      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'note1 ! Jan 2, 2031 ' },
        { noteId: 'note2', text: 'note2' },
        { noteId: 'note3', text: 'note3' },
      ]);

      remdo.validate(() => {
        const note = $findNoteById('note1')!;
        const dateNode = note.getChildren().find($isDateNode)!;
        expect(dateNode.getIsoDate()).toBe('2031-01-02');
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not open the picker when ! follows non-whitespace text', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, 'done!');

    // Mirrors Lexical typeahead trigger boundaries, avoiding prose punctuation false positives.
    // https://lexical.dev/docs/react/plugins
    expect(document.querySelector('[data-date-picker]')).toBeNull();
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1done!' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('opens the picker when ! follows whitespace', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, ' !');

    // Mirrors Lexical typeahead trigger boundaries: start, whitespace, or opening punctuation.
    // https://lexical.dev/docs/react/plugins
    expect(document.querySelector('[data-date-picker-mode="insert"]')).not.toBeNull();
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1 !' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('opens the picker when ! starts a note', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', 0);
    await typeText(remdo, '!');

    // Mirrors Lexical typeahead trigger boundaries: start, whitespace, or opening punctuation.
    // https://lexical.dev/docs/react/plugins
    expect(document.querySelector('[data-date-picker-mode="insert"]')).not.toBeNull();
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: '!note1' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('closes the picker when typing query text after !', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, '!t');

    expect(document.querySelector('[data-date-picker]')).toBeNull();
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1!t' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('updates an existing date node when clicked', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await remdo.mutate(() => {
      const note = $findNoteById('note1')!;
      note.clear();
      note.append($createDateNode('2026-06-10'));
    });

    const dateElement = document.querySelector('[data-date-node-key]');
    expect(dateElement).not.toBeNull();
    await clickElement(dateElement!);

    expect(document.querySelector('[data-date-picker-mode="edit"]')).not.toBeNull();
    await clickPickerDay('2026-06-11');

    const updatedDateElement = document.querySelector('[data-date-node-key]');
    expect(updatedDateElement).toHaveAttribute('data-iso-date', '2026-06-11');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'Jun 11, 2026' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const dateNode = note.getChildren().find($isDateNode)!;
      expect(dateNode.getIsoDate()).toBe('2026-06-11');
      expect(dateNode.getTextContent()).toBe('Jun 11, 2026');
    });
  });

  it('selects a whole date token on ArrowLeft from after it, then moves before it', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await setupInlineDate(remdo);
    await placeCaretNextToDate(remdo, 'after');

    await pressKey(remdo, { key: 'ArrowLeft' });
    expectDateTokenSelected(remdo);

    await pressKey(remdo, { key: 'ArrowLeft' });
    expectDateBoundarySelection(remdo, 'before');
  });

  it('does not reselect a date token when ArrowLeft continues moving away from it', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await setupInlineDate(remdo);
    await placeCaretNextToDate(remdo, 'after');

    await pressKey(remdo, { key: 'ArrowLeft' });
    expectDateTokenSelected(remdo);

    await pressKey(remdo, { key: 'ArrowLeft' });
    expectDateBoundarySelection(remdo, 'before');

    await pressKey(remdo, { key: 'ArrowLeft' });
    expectDateBoundarySelection(remdo, 'before');
  });

  it('selects a whole date token on ArrowRight from before it, then moves after it', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await setupInlineDate(remdo);
    await placeCaretNextToDate(remdo, 'before');

    await pressKey(remdo, { key: 'ArrowRight' });
    expectDateTokenSelected(remdo);

    await pressKey(remdo, { key: 'ArrowRight' });
    expectDateBoundarySelection(remdo, 'after');
  });

  it('does not reselect a date token when ArrowRight continues moving away from it', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await setupInlineDate(remdo);
    await placeCaretNextToDate(remdo, 'before');

    await pressKey(remdo, { key: 'ArrowRight' });
    expectDateTokenSelected(remdo);

    await pressKey(remdo, { key: 'ArrowRight' });
    expectDateBoundarySelection(remdo, 'after');

    await pressKey(remdo, { key: 'ArrowRight' });
    expectDateBoundarySelection(remdo, 'after');
  });

  it('selects a whole date token on ArrowLeft from leading whitespace after it', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await setupInlineDate(remdo);
    await placeCaretAtNoteTextNode(remdo, 'note1', 1, 1);

    await pressKey(remdo, { key: 'ArrowLeft' });
    expectDateTokenSelected(remdo);
  });

  it('selects a whole date token on ArrowRight from trailing whitespace before it', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await setupInlineDate(remdo);
    await placeCaretAtNoteTextNode(remdo, 'note1', 0, 6);

    await pressKey(remdo, { key: 'ArrowRight' });
    expectDateTokenSelected(remdo);
  });

  it('selects a clicked date token while opening the edit picker', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await setupInlineDate(remdo);

    await clickElement(getDateElement());

    expect(document.querySelector('[data-date-picker-mode="edit"]')).not.toBeNull();
    expectDateTokenSelected(remdo);
  });

  it('keeps an edit picker valid when Backspace is pressed on a selected date token', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await setupInlineDate(remdo);

    await clickElement(getDateElement());
    expect(document.querySelector('[data-date-picker-mode="edit"]')).not.toBeNull();
    expectDateTokenSelected(remdo);

    await pressKey(remdo, { key: 'Backspace' });

    expect(document.querySelector('[data-date-picker-mode="edit"]')).not.toBeNull();
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'before Jun 10, 2026 after' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);

    await clickPickerDay('2026-06-11');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'before Jun 11, 2026 after' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('keeps an edit picker valid when Delete is pressed on a selected date token', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await setupInlineDate(remdo);

    await clickElement(getDateElement());
    expect(document.querySelector('[data-date-picker-mode="edit"]')).not.toBeNull();
    expectDateTokenSelected(remdo);

    await pressKey(remdo, { key: 'Delete' });

    expect(document.querySelector('[data-date-picker-mode="edit"]')).not.toBeNull();
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'before Jun 10, 2026 after' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);

    await clickPickerDay('2026-06-11');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'before Jun 11, 2026 after' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('selects a date token on mousedown before the browser can place an inner caret', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await setupInlineDate(remdo);

    await mouseDownElement(getDateElement());

    expect(document.querySelector('[data-date-picker]')).toBeNull();
    expectDateTokenSelected(remdo);
  });

  it('focuses the editor when clicking a date token from outside the editor', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await setupInlineDate(remdo);
    const outsideButton = document.createElement('button');
    document.body.append(outsideButton);
    outsideButton.focus();
    expect(document.activeElement).toBe(outsideButton);

    await mouseDownElement(getDateElement());
    await clickElement(getDateElement());

    expect(document.activeElement).toBe(remdo.editor.getRootElement());
    expect(document.querySelector('[data-date-picker-mode="edit"]')).not.toBeNull();

    await pressKeyOnActiveElement(remdo, 'Escape');

    expect(document.querySelector('[data-date-picker]')).toBeNull();
    outsideButton.remove();
  });

  it('opens the edit picker with Enter on a selected date token', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await setupInlineDate(remdo);
    await placeCaretNextToDate(remdo, 'after');
    await pressKey(remdo, { key: 'ArrowLeft' });

    await pressKey(remdo, { key: 'Enter' });

    expect(document.querySelector('[data-date-picker-mode="edit"]')).not.toBeNull();
    await clickPickerDay('2026-06-11');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'before Jun 11, 2026 after' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('opens the edit picker with Space on a selected date token without inserting text', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await setupInlineDate(remdo);
    await placeCaretNextToDate(remdo, 'after');
    await pressKey(remdo, { key: 'ArrowLeft' });

    await pressSpaceKey(remdo);

    expect(document.querySelector('[data-date-picker-mode="edit"]')).not.toBeNull();
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'before Jun 10, 2026 after' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('clears selected date token focus after the date on Escape without changing the date', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await setupInlineDate(remdo);
    await placeCaretNextToDate(remdo, 'before');
    await pressKey(remdo, { key: 'ArrowRight' });

    await pressKey(remdo, { key: 'Escape' });

    expectDateBoundarySelection(remdo, 'after');
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'before Jun 10, 2026 after' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('selects a date token before deleting it with Backspace', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await setupInlineDate(remdo);
    await placeCaretNextToDate(remdo, 'after');

    await pressKey(remdo, { key: 'Backspace' });
    expectDateTokenSelected(remdo);
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'before Jun 10, 2026 after' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);

    await pressKey(remdo, { key: 'Backspace' });
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'before  after' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('selects a date token before deleting it with Delete', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await setupInlineDate(remdo);
    await placeCaretAtNoteTextNode(remdo, 'note1', 0, Number.POSITIVE_INFINITY);

    await pressKey(remdo, { key: 'Delete' });
    expectDateTokenSelected(remdo);
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'before Jun 10, 2026 after' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);

    await pressKey(remdo, { key: 'Delete' });
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'before  after' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('closes insert picker on outside click while keeping the typed !', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, ' !');

    expect(document.querySelector('[data-date-picker-mode="insert"]')).not.toBeNull();
    // A pointer press outside the editor and picker dismisses it (clicks inside
    // the editor dismiss instead by moving the caret off the trigger).
    await mouseDownElement(document.body);

    expect(document.querySelector('[data-date-picker]')).toBeNull();
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1 !' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('closes edit picker on outside click without changing the date', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await remdo.mutate(() => {
      const note = $findNoteById('note1')!;
      note.clear();
      note.append($createDateNode('2026-06-10'));
    });

    const dateElement = document.querySelector('[data-date-node-key]');
    expect(dateElement).not.toBeNull();
    await clickElement(dateElement!);

    expect(document.querySelector('[data-date-picker-mode="edit"]')).not.toBeNull();
    await mouseDownElement(document.body);

    expect(document.querySelector('[data-date-picker]')).toBeNull();
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'Jun 10, 2026' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const dateNode = note.getChildren().find($isDateNode)!;
      expect(dateNode.getIsoDate()).toBe('2026-06-10');
    });
  });

  it('closes insert picker on Escape while keeping the typed !', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, ' !');
    await pressKey(remdo, { key: 'Escape' });

    // Escape dismisses an open popup without clearing editable text.
    // https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
    expect(document.querySelector('[data-date-picker]')).toBeNull();
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1 !' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('lets Backspace delete the typed ! while closing the insert picker', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, ' !');
    await pressKey(remdo, { key: 'Backspace' });

    // Backspace in editable popup flows deletes the character before the cursor.
    // https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
    expect(document.querySelector('[data-date-picker]')).toBeNull();
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1 ' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('does not reopen the picker when the caret returns beside an existing !', meta({ fixture: 'flat' }), async ({ remdo }) => {
    // Once closed, an existing ! is plain text: only a fresh ! keypress reopens,
    // never moving the caret back beside it (shared trigger lifecycle).
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, ' !');
    await pressKey(remdo, { key: 'Escape' });
    expect(document.querySelector('[data-date-picker]')).toBeNull();

    // Move the caret off the ! and back beside it.
    await pressKey(remdo, { key: 'ArrowLeft' });
    await pressKey(remdo, { key: 'ArrowRight' });
    expect(document.querySelector('[data-date-picker]')).toBeNull();
  });

  it('does not open the date picker on top of an open @ link query', meta({ fixture: 'flat' }), async ({ remdo }) => {
    // A trigger typed inside another picker's query is ordinary text: typing `!`
    // while the `@` link picker is open must not stack a second picker.
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, ' @note2');
    expect(document.querySelector('[data-note-link-picker]')).not.toBeNull();

    await typeText(remdo, ' ');
    await typeText(remdo, '!');

    expect(document.querySelector('[data-note-link-picker]')).not.toBeNull();
    expect(document.querySelector('[data-date-picker]')).toBeNull();
  });

  it('closes the open insert picker when an existing date token is clicked', meta({ fixture: 'flat' }), async ({ remdo }) => {
    // Clicking a date token makes a node selection (not a collapsed caret), which
    // means the user left the query. The insert session must close rather than
    // linger under the edit picker and steal its Escape/Enter handling.
    await remdo.mutate(() => {
      const note = $findNoteById('note2')!;
      note.clear();
      note.append($createDateNode('2026-06-10'));
    });

    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, ' !');
    expect(document.querySelector('[data-date-picker-mode="insert"]')).not.toBeNull();

    await clickElement(document.querySelector('[data-date-node-key]')!);

    // Exactly one picker is open: the edit picker, not the stale insert picker.
    expect(document.querySelector('[data-date-picker-mode="insert"]')).toBeNull();
    expect(document.querySelector('[data-date-picker-mode="edit"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-date-picker]')).toHaveLength(1);
  });
});
