import { describe, expect, it } from 'vitest';
import { placeCaretAtNote, pressKey, typeText } from '#tests';

describe('keyboard helper contract', () => {
  it('typeText inserts characters when keydown is allowed', async ({ remdo }) => {
    await remdo.load('flat');

    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, 'xy');

    expect(remdo).toMatchOutline([
      { text: 'note1xy', children: [] },
      { text: 'note2', children: [] },
      { text: 'note3', children: [] },
    ]);
  });

  it('typeText respects a prevented keydown', async ({ remdo }) => {
    await remdo.load('flat');
    const root = remdo.editor.getRootElement();
    root?.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'x') {
          event.preventDefault();
        }
      },
      { once: true }
    );

    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    const before = remdo.getEditorState();

    await typeText(remdo, 'x');

    expect(remdo).toMatchEditorState(before);
  });

  it('pressKey handles non-text keys (Escape no-op with caret)', async ({ remdo }) => {
    await remdo.load('flat');
    await placeCaretAtNote(remdo, 'note1', 0);
    const before = remdo.getEditorState();

    await pressKey(remdo, { key: 'Escape' });

    expect(remdo).toMatchEditorState(before);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
  });

  it('pressKey rejects plain printable characters', async ({ remdo }) => {
    await remdo.load('flat');
    await placeCaretAtNote(remdo, 'note1', 0);

    await expect(pressKey(remdo, { key: 'x' })).rejects.toThrow(/use typeText/);
  });

  it('pressKey rejects unsupported non-text chords', async ({ remdo }) => {
    await remdo.load('flat');
    await placeCaretAtNote(remdo, 'note1', 0);

    await expect(pressKey(remdo, { key: 'F13' })).rejects.toThrow(/does not support/);
  });
});
