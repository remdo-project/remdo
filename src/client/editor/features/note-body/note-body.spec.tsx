import { describe, expect, it } from 'vitest';
import { REDO_COMMAND, UNDO_COMMAND } from 'lexical';
import {
  copySelection,
  pastePayload,
  placeCaretAtNote,
  pressKey,
  readCaretNoteId,
  selectStructuralNotes,
  typeText,
  meta,
} from '#tests';
import type { RemdoTestApi } from '#client/editor/plugins/dev';
import { $skipBodyForVerticalNav } from './note-body-ops';

describe('note body (docs/outliner/body.md)', () => {
  it('shift+Enter on a note adds a body and moves the caret into it', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'a body');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1', body: 'a body' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('shift+Enter on a note that already has a body focuses the existing body', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'first');

    // Move the caret back to the note, then Shift+Enter again.
    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1', body: 'Xfirst' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('the body is not a note: it carries no noteId and is not a separate outline note', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'body text');

    // The body content attaches to note1 as its body, never as its own note.
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1', body: 'body text' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('backspace on an empty body removes it and returns the caret to the note', meta({ fixture: 'flat' }), async ({ remdo }) => {
    // A freshly created body is empty; Backspace on it removes the body.
    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await pressKey(remdo, { key: 'Backspace' });

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
  });

  it('delete on an empty body removes it and returns the caret to the note', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await pressKey(remdo, { key: 'Delete' });

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
  });

  it('select-all + Delete inside a non-empty body removes the body in one step', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'some body text');

    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    await pressKey(remdo, { key: 'Delete' });

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
  });

  it('undo restores a deleted body and its text as one step; redo removes it again', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'body text');
    await remdo.waitForSynced();

    // Separate creating the body from deleting it past the collab undo capture
    // window (Yjs UndoManager coalesces create+delete within ~500ms into a
    // no-op step), so this exercises the real "create, later delete, undo" flow.
    await new Promise((resolve) => setTimeout(resolve, 600));

    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    await pressKey(remdo, { key: 'Delete' });
    await remdo.waitForSynced();

    const withBody = [
      { noteId: 'note1', text: 'note1', body: 'body text' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ];
    const withoutBody = [
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ];
    expect(remdo).toMatchOutline(withoutBody);

    // One undo brings the body and its text back (selection is not asserted:
    // undo restores structure/content, not the caret).
    await remdo.dispatchCommand(UNDO_COMMAND);
    await remdo.waitForSynced();
    expect(remdo).toMatchOutline(withBody);

    await remdo.dispatchCommand(REDO_COMMAND);
    await remdo.waitForSynced();
    expect(remdo).toMatchOutline(withoutBody);
  });

  it('a body travels with its note: structural delete removes the note and its body', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'note2 body');

    // Structurally select note2 (which now carries a body) and delete it.
    await selectStructuralNotes(remdo, 'note2', 'note2');
    await pressKey(remdo, { key: 'Delete' });

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('structural selection of a note with a body never selects the body as a note', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'body');

    // Selecting note1 + note2 structurally must yield exactly those two notes;
    // the body is not an additional structural note.
    await selectStructuralNotes(remdo, 'note1', 'note2');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2'] });
  });

  it('copy/paste of a note with a body never turns the body into a standalone note', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'note2 body');

    await selectStructuralNotes(remdo, 'note2', 'note2');
    const payload = await copySelection(remdo);

    await selectStructuralNotes(remdo, 'note3', 'note3');
    await pastePayload(remdo, payload);

    // The pasted copy is a clean note. Carrying the body across clipboard is a
    // tracked follow-up (docs/todo.md); the invariant enforced here is that the
    // body never leaks out as its own standalone note with a noteId.
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2', body: 'note2 body' },
      { noteId: null, text: 'note2' },
    ]);
  });

  it('enter inside a body inserts a line break instead of creating a note', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'one');
    await pressKey(remdo, { key: 'Enter' });
    await typeText(remdo, 'two');

    // No new note was created; the body now holds a line break between the two
    // typed segments.
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1', body: 'onetwo' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);

    expect(JSON.stringify(remdo.getEditorState())).toContain('"linebreak"');
  });

  it('enter confirms an @ note-link inside a body instead of inserting a line break', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'see @note2');
    await pressKey(remdo, { key: 'Enter' });

    // The picker confirmed the link (body shows the linked title and a trailing
    // space), and Enter did not insert a line break.
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1', body: 'see note2 ' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
    expect(JSON.stringify(remdo.getEditorState())).not.toContain('"linebreak"');
  });

  it('tab confirms an @ note-link inside a body', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'see @note3');
    await pressKey(remdo, { key: 'Tab' });

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1', body: 'see note3 ' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('enter at the end of a note that has a body inserts the new sibling after the body', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'b');

    // Caret at the end of note1, then Enter: the new note must land after the
    // body, never between note1 and its body.
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter' });
    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1', body: 'b' },
      { noteId: null, text: 'X' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });
});

// Vertical arrow navigation is transparent to a body: it lands where it would if
// the body were not there. jsdom does not move the caret on arrow keys, so these
// exercise the model-level skip directly (placing the caret, then invoking the
// redirect the arrow command performs).
describe('note body vertical navigation (docs/outliner/body.md)', () => {
  async function addBodyTo(remdo: RemdoTestApi, noteId: string, text: string) {
    await placeCaretAtNote(remdo, noteId, Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, text);
  }

  it('down from a flat note with a body lands on the next sibling, skipping the body', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await addBodyTo(remdo, 'note1', 'body');
    await placeCaretAtNote(remdo, 'note1', 0);

    let handled = false;
    await remdo.mutate(() => {
      handled = $skipBodyForVerticalNav('down');
    });
    expect(handled).toBe(true);
    expect(readCaretNoteId(remdo)).toBe('note2');
  });

  it('down from a note with a body and children lands on the first child, skipping the body', meta({ fixture: 'tree' }), async ({ remdo }) => {
    // tree: note1; note2 > note3. Body on note2 (which has child note3).
    await addBodyTo(remdo, 'note2', 'body');
    await placeCaretAtNote(remdo, 'note2', 0);

    let handled = false;
    await remdo.mutate(() => {
      handled = $skipBodyForVerticalNav('down');
    });
    expect(handled).toBe(true);
    expect(readCaretNoteId(remdo)).toBe('note3');
  });

  it('up into a nested body redirects to the body owner, not the body', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    // note2 > note3 (leaf); note4 is note2's sibling. Body on note3 renders just
    // above note4, so Up from note4 must reach note3, not its body.
    await addBodyTo(remdo, 'note3', 'body');
    await placeCaretAtNote(remdo, 'note4', 0);

    let handled = false;
    await remdo.mutate(() => {
      handled = $skipBodyForVerticalNav('up');
    });
    expect(handled).toBe(true);
    expect(readCaretNoteId(remdo)).toBe('note3');
  });

  it('up from a note not below any body is left to native movement', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await addBodyTo(remdo, 'note1', 'body');
    await placeCaretAtNote(remdo, 'note3', 0);

    // note3 sits below note2 (no body), so the body skip does not apply.
    const handled = remdo.validate(() => $skipBodyForVerticalNav('up'));
    expect(handled).toBe(false);
  });
});
