import { describe, expect, it } from 'vitest';
import { readMarkdownOutline } from '#tests-common/markdown-outline';

describe('reading expected outlines from Markdown', () => {
  it('reads nesting, checked notes, empty notes and declared IDs', () => {
    expect(readMarkdownOutline(`
      - note1
          - id:: first
          - note2
              - [x] done
      -
      1. **bold** and \`code\`
    `)).toEqual({
      notes: [
        { text: 'note1', id: 'first', children: [{ text: 'note2', children: [{ text: 'done', checked: true }] }] },
        {},
        { text: 'bold and code' },
      ],
      selection: null,
    });
  });

  it('reads a caret at its offset in the note text, past inline markup', () => {
    expect(readMarkdownOutline(`
      - note1
      - **no**<selection />te2
    `).selection).toEqual({ state: 'caret', at: { note: [1], offset: 2 } });
  });

  it('reads a range within one note', () => {
    expect(readMarkdownOutline(`
      - note1
          - n<selection>ote</selection>2
    `).selection).toEqual({ state: 'inline', start: { note: [0, 0], offset: 1 }, end: { note: [0, 0], offset: 4 } });
  });

  it('reads a note range from tags on their own lines, with the notes it wraps', () => {
    const outline = readMarkdownOutline(`
      - note1
      <selection>
      - note2
          - note3
      - note4
      </selection>
      - note5
    `);

    expect(outline.notes.map((note) => note.text)).toEqual(['note1', 'note2', 'note4', 'note5']);
    expect(outline.selection).toEqual({ state: 'structural', notes: [[1], [1, 0], [2]] });
  });

  it.each([
    ['an empty first child, which CommonMark reads as a heading underline', '- note1\n    -\n- note2', /heading/u],
    ['a second paragraph', '- note1\n\n  more', /one paragraph/u],
    ['a lazy continuation line', '- note1\ncontinued', /marker's line/u],
    ['notes under an id:: line', '- note1\n    - id:: first\n        - note2', /id:: line/u],
    ['text before the list', 'stray\n- note1', /outside any note/u],
    ['text after a blank line', '- note1\n\ncontinued', /outside any note/u],
    ['a second paragraph under an id:: line', '- note1\n    - id:: first\n\n      more', /one paragraph/u],
    ['a second id:: line', '- note1\n    - id:: first\n    - id:: second', /one id:: line/u],
    ['a thematic break', '- ***', /hr/u],
    ['an indented code block', '-     code', /code_block/u],
    ['inline HTML', '- a <b> c', /html_inline/u],
    ['a list inside a quote', '> - note1', /blockquote_open/u],
  ])('refuses %s instead of dropping it', (_case, source, message) => {
    expect(() => readMarkdownOutline(source)).toThrow(message);
  });

  it('refuses a range across notes, which the editor turns into a note range', () => {
    expect(() => readMarkdownOutline(`
      - no<selection>te1
      - no</selection>te2
    `)).toThrow(/range within one note/u);
  });
});
