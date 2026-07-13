import { describe, it, expect } from 'vitest';

import { meta, selectStructuralNotes } from '#tests';
import { $deleteSelectedNotes } from '#client/editor/outline/selection/delete-selection';

// $deleteSelectedNotes is the structural-delete seam the keyboard Backspace/Delete
// path reuses (docs/outliner/deletion.md), callable outside a KeyboardEvent.
describe('deleteSelectedNotes helper', () => {
  it('deletes the structural selection', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note2', 'note3');

    let deleted = false;
    await remdo.mutate(() => {
      deleted = $deleteSelectedNotes(remdo.editor);
    });

    expect(deleted).toBe(true);
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1', children: [{ noteId: 'note4', text: 'note4' }] },
      { noteId: 'note5', text: 'note5' },
      { noteId: 'note6', text: 'note6', children: [{ noteId: 'note7', text: 'note7' }] },
    ]);
  });

  it('no-ops without a structural selection', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    // No structural selection: the helper returns false without mutating, so it
    // runs inside read() (mutate() would assert an update that never happens).
    expect(remdo.editor.read(() => $deleteSelectedNotes(remdo.editor))).toBe(false);
  });
});
