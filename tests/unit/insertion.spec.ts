import { describe, expect, it } from 'vitest';
import { placeCaretAtNote, pressKey } from '#tests';

describe('insertion semantics (docs/insertion.md)', () => {
  it('enter at start inserts a previous sibling and keeps children with the original', async ({ lexical }) => {
    await lexical.load('basic');

    await placeCaretAtNote('note1', lexical.mutate, 0);
    await pressKey(lexical.editor, { key: 'Enter' });

    await pressKey(lexical.editor, { key: 'x' });

    expect(lexical).toMatchOutline([
      { text: 'x', children: [] },
      { text: 'note1', children: [ { text: 'note2', children: [] } ] },
      { text: 'note3', children: [] },
    ]);
    expect(lexical).toMatchSelection({ state: 'caret', note: 'x' });
  });

  it.fails('enter in the middle splits into an above sibling while trailing text and children stay with the original', async ({ lexical }) => {
    await lexical.load('tree');

    await placeCaretAtNote('note1', lexical.mutate, 2);
    await pressKey(lexical.editor, { key: 'Enter' });

    await pressKey(lexical.editor, { key: 'X' });

    expect(lexical).toMatchOutline([
      { text: 'no', children: [] },
      { text: 'Xte1', children: [] },
      { text: 'note2', children: [ { text: 'note3', children: [] } ] },
    ]);
    expect(lexical).toMatchSelection({ state: 'caret', note: 'Xte1' });
  });

  it.fails('enter at end creates a first child and focuses it', async ({ lexical }) => {
    await lexical.load('basic');

    await placeCaretAtNote('note1', lexical.mutate, Number.POSITIVE_INFINITY);
    await pressKey(lexical.editor, { key: 'Enter' });

    await pressKey(lexical.editor, { key: 'x' });

    expect(lexical).toMatchOutline([
      {
        text: 'note1',
        children: [
          { text: 'x', children: [] },
          { text: 'note2', children: [] },
        ],
      },
      { text: 'note3', children: [] },
    ]);
    expect(lexical).toMatchSelection({ state: 'caret', note: 'x' });
  });

  it('enter is a no-op in structural mode', async ({ lexical }) => {
    await lexical.load('tree');

    await placeCaretAtNote('note2', lexical.mutate);
    await pressKey(lexical.editor, { key: 'a', ctrlOrMeta: true });
    await pressKey(lexical.editor, { key: 'a', ctrlOrMeta: true });
    expect(lexical).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

    const before = lexical.getEditorState();
    await pressKey(lexical.editor, { key: 'Enter' });

    expect(lexical).toMatchEditorState(before);
    expect(lexical).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });
  });

  it.fails('enter split inside nested note inserts sibling above within same parent', async ({ lexical }) => {
    await lexical.load('tree');

    await placeCaretAtNote('note2', lexical.mutate, 2);
    await pressKey(lexical.editor, { key: 'Enter' });
    await pressKey(lexical.editor, { key: 'X' });

    expect(lexical).toMatchOutline([
      { text: 'note1', children: [] },
      { text: 'no', children: [] },
      { text: 'Xte2', children: [ { text: 'note3', children: [] } ] },
    ]);
    expect(lexical).toMatchSelection({ state: 'caret', note: 'Xte2' });
  });

  it.fails('enter at end inserts new first child ahead of existing children', async ({ lexical }) => {
    await lexical.load('tree');

    await placeCaretAtNote('note2', lexical.mutate, Number.POSITIVE_INFINITY);
    await pressKey(lexical.editor, { key: 'Enter' });
    await pressKey(lexical.editor, { key: 'x' });

    expect(lexical).toMatchOutline([
      { text: 'note1', children: [] },
      {
        text: 'note2',
        children: [
          { text: 'x', children: [] },
          { text: 'note3', children: [] },
        ],
      },
    ]);
    expect(lexical).toMatchSelection({ state: 'caret', note: 'x' });
  });

  it.fails('enter at start of nested note inserts previous sibling at same depth', async ({ lexical }) => {
    await lexical.load('tree');

    await placeCaretAtNote('note3', lexical.mutate, 0);
    await pressKey(lexical.editor, { key: 'Enter' });
    await pressKey(lexical.editor, { key: 'x' });

    expect(lexical).toMatchOutline([
      { text: 'note1', children: [] },
      {
        text: 'note2',
        children: [
          { text: 'x', children: [] },
          { text: 'note3', children: [] },
        ],
      },
    ]);
    expect(lexical).toMatchSelection({ state: 'caret', note: 'x' });
  });
});
