import { describe, it, expect } from 'vitest';
import { waitFor } from '@testing-library/react';

import { meta, placeCaretAtNote, selectStructuralNotes } from '#tests';
import {
  DELETE_SELECTED_NOTES_COMMAND,
  INDENT_NOTES_COMMAND,
  OUTDENT_NOTES_COMMAND,
  REORDER_NOTES_DOWN_COMMAND,
} from '#client/editor/commands';
import { $getNoteChecked } from '#client/editor/runtime/checklist-state';
import { $findNoteById } from '#client/editor/outline/note-traversal';
import { resolveSelectionCapability, runMobileAction } from '#client/editor/plugins/mobile-toolbar/actions';

// Behavior coverage for the mobile action toolbar (docs/outliner/mobile-toolbar.md).
// Every toolbar action is a command dispatch reusing existing wiring: these
// tests exercise the new commands the toolbar adds (indent/outdent/delete)
// behaviorally, verify runMobileAction maps all nine action ids to the right
// command, and check the fold/delete capability the toolbar reflects. The
// underlying reorder/done/fold/undo/redo operations are covered by their own
// plugins' tests. Presence gating (coarse-pointer) is verified live per
// AGENTS.md — the route harness never reaches schemaReady to mount the toolbar.
//
// tree-complex: note1 → [note2 → [note3], note4]; note5; note6 → [note7].
describe('mobile toolbar actions', () => {
  it('indents the selected note under its previous sibling', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note4');

    await remdo.dispatchCommand(INDENT_NOTES_COMMAND, undefined);

    // note4 indents under its previous sibling note2 (which already owns note3).
    expect(remdo).toMatchOutline([
      {
        noteId: 'note1', text: 'note1',
        children: [
          {
            noteId: 'note2', text: 'note2',
            children: [{ noteId: 'note3', text: 'note3' }, { noteId: 'note4', text: 'note4' }],
          },
        ],
      },
      { noteId: 'note5', text: 'note5' },
      { noteId: 'note6', text: 'note6', children: [{ noteId: 'note7', text: 'note7' }] },
    ]);
  });

  it('outdents the selected child to its parent level', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note3');

    await remdo.dispatchCommand(OUTDENT_NOTES_COMMAND, undefined);

    // note3 was note2's only child; outdenting lifts it to a sibling after note2.
    expect(remdo).toMatchOutline([
      {
        noteId: 'note1', text: 'note1',
        children: [
          { noteId: 'note2', text: 'note2' },
          { noteId: 'note3', text: 'note3' },
          { noteId: 'note4', text: 'note4' },
        ],
      },
      { noteId: 'note5', text: 'note5' },
      { noteId: 'note6', text: 'note6', children: [{ noteId: 'note7', text: 'note7' }] },
    ]);
  });

  it('moves the selected note down past its next sibling', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1');

    await remdo.dispatchCommand(REORDER_NOTES_DOWN_COMMAND, undefined);

    expect(remdo).toMatchOutline([
      { noteId: 'note5', text: 'note5' },
      {
        noteId: 'note1', text: 'note1',
        children: [
          { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3' }] },
          { noteId: 'note4', text: 'note4' },
        ],
      },
      { noteId: 'note6', text: 'note6', children: [{ noteId: 'note7', text: 'note7' }] },
    ]);
  });

  it('deletes the structural selection', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note5', 'note6');

    await remdo.dispatchCommand(DELETE_SELECTED_NOTES_COMMAND, undefined);

    expect(remdo).toMatchOutline([
      {
        noteId: 'note1', text: 'note1',
        children: [
          { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3' }] },
          { noteId: 'note4', text: 'note4' },
        ],
      },
    ]);
  });

  it('toggles fold on the focus note', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    // fold is the action with the most dispatch logic (resolve the focus note
    // key). note6 is a parent, so folding it is observable in the outline.
    await placeCaretAtNote(remdo, 'note6');

    runMobileAction(remdo.editor, 'fold');

    await waitFor(() => {
      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'note1', children: [
          { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3' }] },
          { noteId: 'note4', text: 'note4' },
        ] },
        { noteId: 'note5', text: 'note5' },
        { noteId: 'note6', text: 'note6', folded: true, children: [{ noteId: 'note7', text: 'note7' }] },
      ]);
    });
  });

  it('toggles done on the selected note', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note5');

    runMobileAction(remdo.editor, 'done');

    await waitFor(() => {
      const checked = remdo.editor.getEditorState().read(() => $getNoteChecked($findNoteById('note5')!));
      expect(checked).toBe(true);
    });
  });

  it('reflects fold capability: enabled for a parent, disabled for a leaf', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note6');
    expect(resolveSelectionCapability(remdo.editor).fold).toBe(true);

    await placeCaretAtNote(remdo, 'note7');
    expect(resolveSelectionCapability(remdo.editor).fold).toBe(false);
  });

  it('does not fold the current zoom root', meta({ fixture: 'tree-complex', viewProps: { zoomNoteId: 'note2' } }), async ({ remdo }) => {
    // Zoomed into note2 (which has child note3): folding note2 itself would hide
    // the zoomed-in content, so with the caret on the zoom root fold is disabled
    // and a tap is a no-op — matching the note menu's zoom-root guard.
    await placeCaretAtNote(remdo, 'note2');
    expect(resolveSelectionCapability(remdo.editor).fold).toBe(false);

    const before = remdo.getEditorState();
    runMobileAction(remdo.editor, 'fold');
    expect(remdo).toMatchEditorState(before);
  });

  it('reflects delete capability: enabled for a caret in a note and for a structural selection', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note5');
    expect(resolveSelectionCapability(remdo.editor).delete).toBe(true);

    await selectStructuralNotes(remdo, 'note5', 'note6');
    expect(resolveSelectionCapability(remdo.editor).delete).toBe(true);
  });

  it('deletes the focused note from a caret (removes the note and its subtree)', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note6');

    await remdo.dispatchCommand(DELETE_SELECTED_NOTES_COMMAND, undefined);

    // note6 and its child note7 are gone; the rest is untouched.
    expect(remdo).toMatchOutline([
      {
        noteId: 'note1', text: 'note1',
        children: [
          { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3' }] },
          { noteId: 'note4', text: 'note4' },
        ],
      },
      { noteId: 'note5', text: 'note5' },
    ]);
  });
});
