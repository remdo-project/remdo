import { describe, expect, it } from 'vitest';
import type { Outline } from '#tests';
import { placeCaretAtNote, pressKey } from '#tests';

interface OutlineCase {
  fixture: string;
  outline: Outline;
}

const CASES: OutlineCase[] = [
  {
    fixture: 'flat',
    outline: [
      { text: 'note1', children: [] },
      { text: 'note2', children: [] },
      { text: 'note3', children: [] },
    ],
  },
  {
    fixture: 'basic',
    outline: [
      { text: 'note1', children: [ { text: 'note2', children: [] } ] },
      { text: 'note3', children: [] },
    ],
  },
  {
    fixture: 'tree',
    outline: [
      { text: 'note1', children: [] },
      { text: 'note2', children: [ { text: 'note3', children: [] } ] },
    ],
  },
  {
    fixture: 'tree_complex',
    outline: [
      {
        text: 'note1',
        children: [
          { text: 'note2', children: [ { text: 'note3', children: [] } ] },
          { text: 'note4', children: [] },
        ],
      },
      { text: 'note5', children: [] },
      { text: 'note6', children: [ { text: 'note7', children: [] } ] },
    ],
  },
  {
    fixture: 'empty-labels',
    outline: [
      { text: 'alpha', children: [] },
      { text: '', children: [] },
      { text: '', children: [] },
      { text: '', children: [ { text: '', children: [] }, { text: 'child-of-empty', children: [] } ] },
    ],
  },
];

describe('toMatchOutline smoke coverage', () => {
  for (const { fixture, outline } of CASES) {
    it(`reads ${fixture}`, async ({ lexical }) => {
      await lexical.load(fixture);
      expect(lexical).toMatchOutline(outline);
    });
  }

  it('surfaces expected vs received outline when the matcher fails', async ({ lexical }) => {
    await lexical.load('flat');

    let thrown: unknown;
    try {
      expect(lexical).toMatchOutline([{ text: 'wrong label', children: [] }]);
    } catch (error) {
      thrown = error;
    }

    if (!(thrown instanceof Error)) {
      throw new Error('Expected toMatchOutline mismatch to throw');
    }

    expect(thrown.message).toContain('Outlines differ.');
    expect(thrown.message).toContain('"text": "wrong label"');
    expect(thrown.message).toContain('"text": "note1"');
    expect(thrown.message).toContain('"text": "note2"');
    expect(thrown.message).toContain('"text": "note3"');
  });

  it('matches selection-only expectations', async ({ lexical }) => {
    await lexical.load('tree_complex');

    await placeCaretAtNote('note2', lexical.mutate);
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });

    expect(lexical).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });
  });

  it('reports selection mismatches', async ({ lexical }) => {
    await lexical.load('tree_complex');

    await placeCaretAtNote('note2', lexical.mutate);
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });

    expect(() => {
      expect(lexical).toMatchSelection({ state: 'structural', notes: ['note5'] });
    }).toThrowError(/Selections differ/);
  });
});
