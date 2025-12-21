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
      { text: 'note1' },
      { text: 'note2' },
      { text: 'note3' },
    ],
  },
  {
    fixture: 'edge-spaces',
    outline: [
      { text: 'note1' },
      { text: ' note2-space-left' },
      { text: 'note3' },
      { text: 'note4-space-right ' },
      { text: 'note5' },
    ],
  },
  {
    fixture: 'basic',
    outline: [
      { text: 'note1', children: [ { text: 'note2' } ] },
      { text: 'note3' },
    ],
  },
  {
    fixture: 'formatted',
    outline: [
      { text: 'bold', children: [ { text: 'italic' } ] },
      { text: 'underline' },
      { text: 'plain bold italic underline plain' },
    ],
  },
  {
    fixture: 'main',
    outline: [
      { text: 'note1', children: [ { text: 'note2' } ] },
      { text: 'note3' },
    ],
  },
  {
    fixture: 'tree',
    outline: [
      { text: 'note1' },
      { text: 'note2', children: [ { text: 'note3' } ] },
    ],
  },
  {
    fixture: 'tree_complex',
    outline: [
      {
        text: 'note1',
        children: [
          { text: 'note2', children: [ { text: 'note3' } ] },
          { text: 'note4' },
        ],
      },
      { text: 'note5' },
      { text: 'note6', children: [ { text: 'note7' } ] },
    ],
  },
  {
    fixture: 'empty-labels',
    outline: [
      { text: 'alpha' },
      { text: ' ' },
      { text: 'beta' },
      { children: [ {}, { text: 'child-of-empty' } ] },
    ],
  },
];

describe('toMatchOutline smoke coverage', () => {
  for (const { fixture, outline } of CASES) {
    it(`reads ${fixture}`, async ({ remdo }) => {
      await remdo.load(fixture);
      expect(remdo).toMatchOutline(outline);
    });
  }

  it('surfaces expected vs received outline when the matcher fails', async ({ remdo }) => {
    await remdo.load('flat');

    let thrown: unknown;
    try {
      expect(remdo).toMatchOutline([{ text: 'wrong label' }]);
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

  it('matches selection-only expectations', async ({ remdo }) => {
    await remdo.load('tree_complex');

    await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });

    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });
  });

  it('reports selection mismatches', async ({ remdo }) => {
    await remdo.load('tree_complex');

    await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });

    expect(() => {
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note5'] });
    }).toThrowError(/Selections differ/);
  });
});
