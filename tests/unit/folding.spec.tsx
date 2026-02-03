import { describe, expect, it } from 'vitest';

import { $setNoteFolded } from '#lib/editor/fold-state';
import { $findNoteById } from '@/editor/outline/note-traversal';
import { removeNoteSubtree } from '@/editor/outline/selection/tree';
import { meta, placeCaretAtNote, pressKey } from '#tests';

describe('folding (docs/outliner/folding.md)', () => {
  it('stores folded only when true', meta({ fixture: 'basic' }), async ({ remdo }) => {
    await remdo.mutate(() => {
      const note = $findNoteById('note1')!;
      $setNoteFolded(note, true);
    });

    expect(remdo).toMatchOutline([
      {
        noteId: 'note1',
        text: 'note1',
        folded: true,
        children: [{ noteId: 'note2', text: 'note2' }],
      },
      { noteId: 'note3', text: 'note3' },
    ]);

    await remdo.mutate(() => {
      const note = $findNoteById('note1')!;
      $setNoteFolded(note, false);
    });

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
    await remdo.mutate(() => {
      const note = $findNoteById('note1')!;
      const child = $findNoteById('note2')!;
      $setNoteFolded(note, true);
      removeNoteSubtree(child);
    });

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('auto-expands a folded parent when indenting a new child', meta({ fixture: 'basic' }), async ({ remdo }) => {
    await remdo.mutate(() => {
      const note = $findNoteById('note1')!;
      $setNoteFolded(note, true);
    });

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
});
