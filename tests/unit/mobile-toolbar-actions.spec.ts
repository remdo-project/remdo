import { describe, it, expect, vi } from 'vitest';

import { meta, placeCaretAtNote, selectStructuralNotes } from '#tests';
import { REDO_COMMAND, UNDO_COMMAND } from 'lexical';
import {
  DELETE_SELECTED_NOTES_COMMAND,
  INDENT_NOTES_COMMAND,
  OUTDENT_NOTES_COMMAND,
  REORDER_NOTES_DOWN_COMMAND,
  REORDER_NOTES_UP_COMMAND,
  SET_NOTE_CHECKED_COMMAND,
  SET_NOTE_FOLD_COMMAND,
} from '#client/editor/commands';
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

  it('maps each action id to its command dispatch', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    // note6 (a parent) so fold resolves a note key to dispatch with.
    await placeCaretAtNote(remdo, 'note6');
    const foldKey = remdo.editor.read(() => remdo.editor.selection.get()?.focusKey);
    const dispatch = vi.spyOn(remdo.editor, 'dispatchCommand');

    runMobileAction(remdo.editor, 'indent');
    expect(dispatch).toHaveBeenCalledWith(INDENT_NOTES_COMMAND, undefined);
    runMobileAction(remdo.editor, 'outdent');
    expect(dispatch).toHaveBeenCalledWith(OUTDENT_NOTES_COMMAND, undefined);
    runMobileAction(remdo.editor, 'moveUp');
    expect(dispatch).toHaveBeenCalledWith(REORDER_NOTES_UP_COMMAND, undefined);
    runMobileAction(remdo.editor, 'moveDown');
    expect(dispatch).toHaveBeenCalledWith(REORDER_NOTES_DOWN_COMMAND, undefined);
    runMobileAction(remdo.editor, 'done');
    expect(dispatch).toHaveBeenCalledWith(SET_NOTE_CHECKED_COMMAND, { state: 'toggle' });
    runMobileAction(remdo.editor, 'fold');
    expect(dispatch).toHaveBeenCalledWith(SET_NOTE_FOLD_COMMAND, { state: 'toggle', noteItemKey: foldKey });
    runMobileAction(remdo.editor, 'delete');
    expect(dispatch).toHaveBeenCalledWith(DELETE_SELECTED_NOTES_COMMAND, undefined);
    runMobileAction(remdo.editor, 'undo');
    expect(dispatch).toHaveBeenCalledWith(UNDO_COMMAND, undefined);
    runMobileAction(remdo.editor, 'redo');
    expect(dispatch).toHaveBeenCalledWith(REDO_COMMAND, undefined);

    dispatch.mockRestore();
  });

  it('reflects fold capability: enabled for a parent, disabled for a leaf', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note6');
    expect(resolveSelectionCapability(remdo.editor).fold).toBe(true);

    await placeCaretAtNote(remdo, 'note7');
    expect(resolveSelectionCapability(remdo.editor).fold).toBe(false);
  });

  it('reflects delete capability: enabled for a structural selection, disabled for a caret', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note5');
    expect(resolveSelectionCapability(remdo.editor).delete).toBe(false);

    await selectStructuralNotes(remdo, 'note5', 'note6');
    expect(resolveSelectionCapability(remdo.editor).delete).toBe(true);
  });
});
