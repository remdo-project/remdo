import { describe, expect, it } from 'vitest';

interface OutlineCase {
  fixture: string;
  outline: Array<{ text: string; children: OutlineCase['outline'] }>;
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
});
