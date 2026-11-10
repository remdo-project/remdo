import { describe, expect, it } from 'vitest';
import { markdownNoteText, readMarkdownOutline } from '#tests-common/markdown-outline';

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

  it('reads a body from its > lines, before the children, wherever the properties sit', () => {
    expect(readMarkdownOutline(`
      - note1
          > first line
          >
          > third
          - id:: first
          - note2
      -
          > body of an empty note
    `).notes).toEqual([
      { text: 'note1', body: 'first line\n\nthird', id: 'first', children: [{ text: 'note2' }] },
      { body: 'body of an empty note' },
    ]);
    expect(readMarkdownOutline('- note1\n    >\ttabbed').notes).toEqual([{ text: 'note1', body: '\ttabbed' }]);
    expect(readMarkdownOutline('- note1\n    - folded:: true\n    - id:: first\n    > after properties\n    - note2').notes)
      .toEqual([{ text: 'note1', body: 'after properties', id: 'first', folded: true, children: [{ text: 'note2' }] }]);
  });

  it('reads a folded note from its folded:: line', () => {
    expect(readMarkdownOutline(`
      - note1
          > body
          - id:: first
          - folded:: true
          - note2
      - note3
          - folded:: true
          - note4
    `).notes).toEqual([
      { text: 'note1', body: 'body', id: 'first', folded: true, children: [{ text: 'note2' }] },
      { text: 'note3', folded: true, children: [{ text: 'note4' }] },
    ]);
  });

  it('takes each property from its first line among a note\'s children, whatever its value or place', () => {
    expect(readMarkdownOutline(`
      - id:: document
      - folded:: true
      - unfolded by another value
          - folded:: false
          - folded:: true
          - child
      - properties after its children
          - child
          - [x] folded:: true
          - [ ] id:: late
      - no ID from a value id:: doesn't define
          - id:: two words
          - id:: second
      - nothing nested under a property
          - id:: first
              - hidden
          - folded:: true

              more
      - not a name
          - folded::true
    `).notes).toEqual([
      { text: 'unfolded by another value', children: [{ text: 'child' }] },
      { text: 'properties after its children', id: 'late', folded: true, children: [{ text: 'child' }] },
      { text: 'no ID from a value id:: doesn\'t define' },
      { text: 'nothing nested under a property', id: 'first', folded: true },
      { text: 'not a name', children: [{ text: 'folded::true' }] },
    ]);
  });

  it('reads id:: and folded:: values as text, after escapes and character references', () => {
    expect(readMarkdownOutline(`
      - note1
          - id:: a\\_b
          - folded:: &#116;rue
          - note2
    `).notes).toEqual([{ text: 'note1', id: 'a_b', folded: true, children: [{ text: 'note2' }] }]);
  });

  it('keeps spaces at a note\'s edges written as character references', () => {
    expect(markdownNoteText('  two words ')).toBe('&#32;&#32;two words&#32;');
    expect(readMarkdownOutline(`- ${markdownNoteText('  two words ')}`).notes).toEqual([{ text: '  two words ' }]);
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
    ['text before the list', 'stray\n- note1', /outside any note/u],
    ['text after a blank line', '- note1\n\ncontinued', /outside any note/u],
    ['a body after children', '- note1\n    - note2\n    > late', /one > block before/u],
    ['a paragraph after a body', '- note1\n    > body\n\n    more', /one paragraph/u],
    ['a body line without >', '- note1\n    > body\n    more', /Every body line starts with >/u],
    ['a body on its note\'s line', '- > quoted', /Every body line starts with >/u],
    ['a selection in a body','- note1\n    > bo<selection />dy', /own text/u],
    ['a selection in a folded:: line', '- note1\n    - folded:: true<selection />\n    - note2', /own text/u],
    ['a selection before a folded:: line\'s name', '- note1\n    - <selection />folded:: true', /own text/u],
    ['a selection in an ignored property line', '- note1\n    - id:: a\n    - id:: b<selection />', /own text/u],
    ['an id:: line continued on the next line', '- note1\n    - id:: first\n      second', /marker's line/u],
    ['a folded:: line continued on the next line', '- note1\n    - folded:: true\n      more', /marker's line/u],
    ['a thematic break', '- ***', /hr/u],
    ['an indented code block', '-     code', /code_block/u],
    ['an indented code block that looks like a property', '- note1\n    -     id:: first', /code_block/u],
    ['a paragraph after an empty note\'s children', '-\n    - note2\n\n    more', /marker's line/u],
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
