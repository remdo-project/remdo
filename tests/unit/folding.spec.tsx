import { describe, expect, it } from 'vitest';

import { SET_NOTE_FOLD_COMMAND } from '@/editor/commands';
import { $findNoteById } from '@/editor/outline/note-traversal';
import { removeNoteSubtree } from '@/editor/outline/selection/tree';
import { getNoteKey, meta, placeCaretAtNote, pressKey } from '#tests';

describe('folding (docs/outliner/folding.md)', () => {
  it('stores folded only when true', meta({ fixture: 'basic' }), async ({ remdo }) => {
    const noteKey = getNoteKey(remdo, 'note1');
    await remdo.dispatchCommand(SET_NOTE_FOLD_COMMAND, { state: 'toggle', noteKey });

    expect(remdo).toMatchOutline([
      {
        noteId: 'note1',
        text: 'note1',
        folded: true,
        children: [{ noteId: 'note2', text: 'note2' }],
      },
      { noteId: 'note3', text: 'note3' },
    ]);

    await remdo.dispatchCommand(SET_NOTE_FOLD_COMMAND, { state: 'toggle', noteKey });

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
    await remdo.dispatchCommand(SET_NOTE_FOLD_COMMAND, { state: 'toggle', noteKey });

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
    await remdo.dispatchCommand(SET_NOTE_FOLD_COMMAND, { state: 'folded', noteKey }, { expect: 'noop' });

    expect(remdo).toMatchOutline([
      {
        noteId: 'note1',
        text: 'note1',
        children: [{ noteId: 'note2', text: 'note2' }],
      },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('auto-expands a folded parent when indenting a new child', meta({ fixture: 'basic' }), async ({ remdo }) => {
    const noteKey = getNoteKey(remdo, 'note1');
    await remdo.dispatchCommand(SET_NOTE_FOLD_COMMAND, { state: 'toggle', noteKey });

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
    await remdo.dispatchCommand(SET_NOTE_FOLD_COMMAND, { state: 'folded', noteKey });

    expect(remdo).toMatchOutline([
      {
        noteId: 'note1',
        text: 'note1',
        folded: true,
        children: [{ noteId: 'note2', text: 'note2' }],
      },
      { noteId: 'note3', text: 'note3' },
    ]);

    await remdo.dispatchCommand(SET_NOTE_FOLD_COMMAND, { state: 'unfolded', noteKey });

    expect(remdo).toMatchOutline([
      {
        noteId: 'note1',
        text: 'note1',
        children: [{ noteId: 'note2', text: 'note2' }],
      },
      { noteId: 'note3', text: 'note3' },
    ]);
  });
});
