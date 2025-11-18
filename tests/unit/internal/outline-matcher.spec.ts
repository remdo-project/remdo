import { describe, expect, it } from 'vitest';
import type { Outline } from '#tests';

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
    it(`reads ${fixture}`, ({ lexical }) => {
      lexical.load(fixture);
      expect(lexical).toMatchOutline(outline);
    });
  }

  it('surfaces expected vs received outline when the matcher fails', ({ lexical }) => {
    lexical.load('flat');

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
});
