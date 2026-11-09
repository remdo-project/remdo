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
    `).selection).toEqual({ state: 'inline', anchor: { note: [0, 0], offset: 1 }, focus: { note: [0, 0], offset: 4 } });
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

  it('refuses a range across notes, which the editor turns into a note range', () => {
    expect(() => readMarkdownOutline(`
      - no<selection>te1
      - no</selection>te2
    `)).toThrow(/range within one note/u);
  });
});
