import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Document, TreeNote } from '../../../src/headless/outline-tree/tree';
import { readTestDocument } from '#tests-common/test-document';

const fixture = 'tests/fixtures/outline-tree/test-document';

const withoutCacheIds = (notes: TreeNote[]): TreeNote[] => notes.map((note) => (note.kind === 'body'
  ? { ...note, cacheId: null }
  : { ...note, cacheId: null, children: withoutCacheIds(note.children) }));

describe('reading a test document', () => {
  // Python's reader reads the same text as this tree (test_text_format.py).
  it('reads as the tree Python\'s reader gives', () => {
    const tree = JSON.parse(readFileSync(`${fixture}.json`, 'utf8')) as Document;
    const { document } = readTestDocument(readFileSync(`${fixture}.md`, 'utf8'));

    expect({ ...document, children: withoutCacheIds(document.children) }).toEqual(tree);
  });

  it('gives each note its fixture ID as its cache ID, and an id:: line as its written ID', () => {
    const { document } = readTestDocument(`
      - first
          - id:: k3x9
      - second note
    `);

    expect(document.children.map((note) => note.kind === 'outline' && [note.id, note.cacheId]))
      .toEqual([['k3x9', 'k3x9'], [null, 'n1']]);
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

  it.each([
    ['a name', '- Status:: task'],
    ['edge whitespace', '- &#32;a'],
    ['a date', '- [1 Nov 2026](date:2026-11-01)'],
  ])('refuses %s, which it can\'t read as Python does', (_, source) => {
    expect(() => readTestDocument(source)).toThrow();
  });
});
