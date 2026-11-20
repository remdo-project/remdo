import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Document } from '../../../src/headless/outline-tree/tree';
import { readTestDocument } from '#tests-common/test-document';

const fixture = 'tests/fixtures/outline-tree/test-document';

describe('reading a test document', () => {
  // Python's reader reads the same text as this tree (test_text_format.py).
  it('reads as the tree Python\'s reader gives', () => {
    const tree = JSON.parse(readFileSync(`${fixture}.json`, 'utf8')) as Document;
    const { document } = readTestDocument(readFileSync(`${fixture}.md`, 'utf8'));

    expect(document).toEqual(tree);
  });

  it('reads an id:: line as its note\'s written ID', () => {
    const { document } = readTestDocument(`
      - first
          - id:: k3x9
      - second
    `);

    expect(document.children.map((note) => note.kind === 'outline' && note.id)).toEqual(['k3x9', null]);
  });

  it('reports folded notes by their paths over outline notes', () => {
    expect(readTestDocument(`
      - a
          > body
          - b
              - folded:: true
              - c
    `).folded).toEqual([[0, 0]]);
  });

  it('keeps the edge whitespace character references state, which Python\'s reader drops', () => {
    const texts = readTestDocument(`
      - &#32;lead
      - tail&#160;
      - &#32;
      - &#32;&#32;**both**&#32;
    `).document.children.map((note) => note.kind === 'outline' && note.runs);

    expect(texts).toEqual([
      [{ kind: 'text', text: ' lead', marks: [] }],
      [{ kind: 'text', text: 'tail\u00A0', marks: [] }],
      [{ kind: 'text', text: ' ', marks: [] }],
      [{ kind: 'text', text: '  ', marks: [] }, { kind: 'text', text: 'both', marks: ['bold'] }, { kind: 'text', text: ' ', marks: [] }],
    ]);
  });

  it('refuses a heading, which it doesn\'t read yet', () => {
    expect(() => readTestDocument('# Title')).toThrow();
  });
});
