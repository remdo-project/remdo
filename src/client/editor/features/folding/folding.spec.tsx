import { act, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FOLD_VIEW_TO_LEVEL_COMMAND, SET_NOTE_FOLD_COMMAND } from '#client/editor/foundation/commands';
import { $findNoteById } from '#client/editor/outline/note-traversal';
import { removeNoteSubtree } from '#client/editor/outline/selection/tree';
import { getNoteKey, meta, placeCaretAtNote, pressKey, readCaretNoteId } from '#tests';

describe('folding (docs/specs/outliner/folding.md)', () => {
  it('stores folded only when true', meta({ fixture: 'basic' }), async ({ remdo }) => {
    const noteKey = getNoteKey(remdo, 'note1');
    await remdo.dispatchCommand(SET_NOTE_FOLD_COMMAND, { state: 'toggle', noteItemKey: noteKey });

    expect(remdo).toMatchOutline([
      {
        noteId: 'note1',
        text: 'note1',
        folded: true,
        children: [{ noteId: 'note2', text: 'note2' }],
      },
      { noteId: 'note3', text: 'note3' },
    ]);

    await remdo.dispatchCommand(SET_NOTE_FOLD_COMMAND, { state: 'toggle', noteItemKey: noteKey });

    expect(remdo).toMatchOutline([
      {
        noteId: 'note1',
        text: 'note1',
        children: [{ noteId: 'note2', text: 'note2' }],
      },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('clears folded when the last child is removed', meta({ fixture: 'basic' }), async ({ remdo }) => {
    const noteKey = getNoteKey(remdo, 'note1');
    await remdo.dispatchCommand(SET_NOTE_FOLD_COMMAND, { state: 'toggle', noteItemKey: noteKey });

    await remdo.mutate(() => {
      const child = $findNoteById('note2')!;
      removeNoteSubtree(child);
    });

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('does not fold leaf notes', meta({ fixture: 'basic' }), async ({ remdo }) => {
    const noteKey = getNoteKey(remdo, 'note3');
    await remdo.dispatchCommand(SET_NOTE_FOLD_COMMAND, { state: 'folded', noteItemKey: noteKey }, { expect: 'noop' });

    expect(remdo).toMatchOutline([
      {
        noteId: 'note1',
        text: 'note1',
        children: [{ noteId: 'note2', text: 'note2' }],
      },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('row toggle returns focus to the editor when focus was outside it', meta({ fixture: 'basic' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1');

    const outside = document.createElement('input');
    document.body.append(outside);
    outside.focus();
    expect(document.activeElement).toBe(outside);

    const toggle = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('.note-controls__button--expanded');
      if (!el) {
        throw new Error('fold toggle not rendered');
      }
      return el;
    });

    await act(async () => {
      toggle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    });

    expect(document.activeElement).toBe(remdo.editor.getRootElement());
    outside.remove();
  });

  it('auto-expands a folded parent when indenting a new child', meta({ fixture: 'basic' }), async ({ remdo }) => {
    const noteKey = getNoteKey(remdo, 'note1');
    await remdo.dispatchCommand(SET_NOTE_FOLD_COMMAND, { state: 'toggle', noteItemKey: noteKey });

    await placeCaretAtNote(remdo, 'note3', 0);
    await pressKey(remdo, { key: 'Tab' });

    expect(remdo).toMatchOutline([
      {
        noteId: 'note1',
        text: 'note1',
        children: [
          { noteId: 'note2', text: 'note2' },
          { noteId: 'note3', text: 'note3' },
        ],
      },
    ]);
  });

  it('sets explicit folded and unfolded states', meta({ fixture: 'basic' }), async ({ remdo }) => {
    const noteKey = getNoteKey(remdo, 'note1');
    await remdo.dispatchCommand(SET_NOTE_FOLD_COMMAND, { state: 'folded', noteItemKey: noteKey });

    expect(remdo).toMatchOutline([
      {
        noteId: 'note1',
        text: 'note1',
        folded: true,
        children: [{ noteId: 'note2', text: 'note2' }],
      },
      { noteId: 'note3', text: 'note3' },
    ]);

    await remdo.dispatchCommand(SET_NOTE_FOLD_COMMAND, { state: 'unfolded', noteItemKey: noteKey });

    expect(remdo).toMatchOutline([
      {
        noteId: 'note1',
        text: 'note1',
        children: [{ noteId: 'note2', text: 'note2' }],
      },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('folds the document view to a specific level and clears it with 0', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await remdo.dispatchCommand(FOLD_VIEW_TO_LEVEL_COMMAND, { level: 1 });

    expect(remdo).toMatchOutline([
      {
        noteId: 'note1',
        text: 'note1',
        folded: true,
        children: [
          {
            noteId: 'note2',
            text: 'note2',
            children: [{ noteId: 'note3', text: 'note3' }],
          },
          { noteId: 'note4', text: 'note4' },
        ],
      },
      { noteId: 'note5', text: 'note5' },
      {
        noteId: 'note6',
        text: 'note6',
        folded: true,
        children: [{ noteId: 'note7', text: 'note7' }],
      },
    ]);

    await remdo.dispatchCommand(FOLD_VIEW_TO_LEVEL_COMMAND, { level: 2 });

    expect(remdo).toMatchOutline([
      {
        noteId: 'note1',
        text: 'note1',
        children: [
          {
            noteId: 'note2',
            text: 'note2',
            folded: true,
            children: [{ noteId: 'note3', text: 'note3' }],
          },
          { noteId: 'note4', text: 'note4' },
        ],
      },
      { noteId: 'note5', text: 'note5' },
      {
        noteId: 'note6',
        text: 'note6',
        children: [{ noteId: 'note7', text: 'note7' }],
      },
    ]);

    await remdo.dispatchCommand(FOLD_VIEW_TO_LEVEL_COMMAND, { level: 0 });

    expect(remdo).toMatchOutline([
      {
        noteId: 'note1',
        text: 'note1',
        children: [
          {
            noteId: 'note2',
            text: 'note2',
            children: [{ noteId: 'note3', text: 'note3' }],
          },
          { noteId: 'note4', text: 'note4' },
        ],
      },
      { noteId: 'note5', text: 'note5' },
      {
        noteId: 'note6',
        text: 'note6',
        children: [{ noteId: 'note7', text: 'note7' }],
      },
    ]);
  });

  it(
    'scopes fold view to level to the current zoom boundary only',
    meta({ fixture: 'tree-complex', viewProps: { zoomNoteId: 'note1' } }),
    async ({ remdo }) => {
      const note6Key = getNoteKey(remdo, 'note6');
      await remdo.dispatchCommand(SET_NOTE_FOLD_COMMAND, { state: 'folded', noteItemKey: note6Key });

      await remdo.dispatchCommand(FOLD_VIEW_TO_LEVEL_COMMAND, { level: 1 });

      expect(remdo).toMatchOutline([
        {
          noteId: 'note1',
          text: 'note1',
          children: [
            {
              noteId: 'note2',
              text: 'note2',
              folded: true,
              children: [{ noteId: 'note3', text: 'note3' }],
            },
            { noteId: 'note4', text: 'note4' },
          ],
        },
        { noteId: 'note5', text: 'note5' },
        {
          noteId: 'note6',
          text: 'note6',
          folded: true,
          children: [{ noteId: 'note7', text: 'note7' }],
        },
      ]);
    }
  );

  it(
    'collapses the caret to the nearest visible ancestor when fold view to level hides the active note',
    meta({ fixture: 'tree-complex', viewProps: { zoomNoteId: 'note1' } }),
    async ({ remdo }) => {
      await placeCaretAtNote(remdo, 'note3', 2);

      await remdo.dispatchCommand(FOLD_VIEW_TO_LEVEL_COMMAND, { level: 1 });

      expect(readCaretNoteId(remdo)).toBe('note2');
    }
  );
});
