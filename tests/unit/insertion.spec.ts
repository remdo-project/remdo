import { describe, expect, it } from 'vitest';
import { placeCaretAtNote, pressKey } from '#tests';

describe('insertion semantics (docs/insertion.md)', () => {
  it('enter at start inserts a previous sibling and keeps children with the original', async ({ remdo }) => {
    await remdo.load('basic');

    await placeCaretAtNote('note1', remdo, 0);
    await pressKey(remdo.editor, { key: 'Enter' });

    await pressKey(remdo.editor, { key: 'x' });

    expect(remdo).toMatchOutline([
      { text: 'x', children: [] },
      { text: 'note1', children: [ { text: 'note2', children: [] } ] },
      { text: 'note3', children: [] },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'x' });
  });

  it('enter in the middle splits into an above sibling while trailing text and children stay with the original', async ({ remdo }) => {
    await remdo.load('tree');

    await placeCaretAtNote('note1', remdo, 2);
    await pressKey(remdo.editor, { key: 'Enter' });

    await pressKey(remdo.editor, { key: 'X' });

    expect(remdo).toMatchOutline([
      { text: 'no', children: [] },
      { text: 'Xte1', children: [] },
      { text: 'note2', children: [ { text: 'note3', children: [] } ] },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'Xte1' });
  });

  it('enter at end creates a first child and focuses it', async ({ remdo }) => {
    await remdo.load('basic');

    await placeCaretAtNote('note1', remdo, Number.POSITIVE_INFINITY);
    await pressKey(remdo.editor, { key: 'Enter' });

    await pressKey(remdo.editor, { key: 'x' });

    expect(remdo).toMatchOutline([
      {
        text: 'note1',
        children: [
          { text: 'x', children: [] },
          { text: 'note2', children: [] },
        ],
      },
      { text: 'note3', children: [] },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'x' });
  });

  it('enter is a no-op in structural mode', async ({ remdo }) => {
    await remdo.load('tree');

    await placeCaretAtNote('note2', remdo);
    await pressKey(remdo.editor, { key: 'a', ctrlOrMeta: true });
    await pressKey(remdo.editor, { key: 'a', ctrlOrMeta: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

    const before = remdo.getEditorState();
    await pressKey(remdo.editor, { key: 'Enter' });

    expect(remdo).toMatchEditorState(before);
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });
  });

  it('enter split inside nested note inserts sibling above within same parent', async ({ remdo }) => {
    await remdo.load('tree');

    await placeCaretAtNote('note2', remdo, 2);
    await pressKey(remdo.editor, { key: 'Enter' });
    await pressKey(remdo.editor, { key: 'X' });

    expect(remdo).toMatchOutline([
      { text: 'note1', children: [] },
      { text: 'no', children: [] },
      { text: 'Xte2', children: [ { text: 'note3', children: [] } ] },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'Xte2' });
  });

  it('enter at end inserts new first child ahead of existing children', async ({ remdo }) => {
    await remdo.load('tree');

    await placeCaretAtNote('note2', remdo, Number.POSITIVE_INFINITY);
    await pressKey(remdo.editor, { key: 'Enter' });
    await pressKey(remdo.editor, { key: 'x' });

    expect(remdo).toMatchOutline([
      { text: 'note1', children: [] },
      {
        text: 'note2',
        children: [
          { text: 'x', children: [] },
          { text: 'note3', children: [] },
        ],
      },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'x' });
  });

  it('enter at start of nested note inserts previous sibling at same depth', async ({ remdo }) => {
    await remdo.load('tree');

    await placeCaretAtNote('note3', remdo, 0);
    await pressKey(remdo.editor, { key: 'Enter' });
    await pressKey(remdo.editor, { key: 'x' });

    expect(remdo).toMatchOutline([
      { text: 'note1', children: [] },
      {
        text: 'note2',
        children: [
          { text: 'x', children: [] },
          { text: 'note3', children: [] },
        ],
      },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'x' });
  });
});
