import { describe, expect, it } from 'vitest';
import {
  placeCaretAtNote,
  pressKey,
  typeText,
  meta,
} from '#tests';

describe('note body (docs/outliner/body.md)', () => {
  it('Shift+Enter on a note adds a body and moves the caret into it', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'a body');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1', body: 'a body' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('Shift+Enter on a note that already has a body focuses the existing body', meta({ fixture: 'flat' }), async ({ remdo }) => {
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

  it('Backspace on an empty body removes it and returns the caret to the note', meta({ fixture: 'flat' }), async ({ remdo }) => {
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

  it('Delete on an empty body removes it and returns the caret to the note', meta({ fixture: 'flat' }), async ({ remdo }) => {
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
});
