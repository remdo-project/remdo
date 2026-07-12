import { describe, it, expect } from 'vitest';

import { meta, selectStructuralNotes } from '#tests';
import {
  $canDeleteSelectedNotes,
  $deleteSelectedNotes,
} from '#client/editor/outline/selection/delete-selection';

// The mobile action toolbar (docs/outliner/mobile-toolbar.md) invokes deletion
// through these helpers directly, not through the keyboard command. These tests
// pin that reuse seam: the same structural-delete behavior and capability check
// the keyboard path relies on, callable outside a KeyboardEvent.
describe('deleteSelectedNotes helper', () => {
  it('deletes the structural selection and reports capability', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note2', 'note3');

    expect(remdo.editor.read(() => $canDeleteSelectedNotes(remdo.editor))).toBe(true);

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

  it('reports no capability and no-ops without a structural selection', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    expect(remdo.editor.read(() => $canDeleteSelectedNotes(remdo.editor))).toBe(false);

    // No structural selection: the helper returns false without mutating, so it
    // runs inside read() (mutate() would assert an update that never happens).
    expect(remdo.editor.read(() => $deleteSelectedNotes(remdo.editor))).toBe(false);
  });
});
