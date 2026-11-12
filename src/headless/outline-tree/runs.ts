import type { Mark, Run } from './tree';

// Python's reader (text_format.py) reads these rules from Markdown; Node applies them to editor
// text so a tree read from the editor matches what its written text reads back as.

const NAME = /^(.*?[^\\\s])::(?: |$)/;
const NOT_PLAIN = /[*_`[\]<&\\]/;
const EDGE_MARKS: readonly Mark[] = ['bold', 'italic', 'strike', 'underline'];

/** The name `text` starts with, when it reads as `name:: text`. */
export function nameOf(text: string): string | null {
  const match = NAME.exec(text);
  return match && !NOT_PLAIN.test(match[1]!) ? match[1]! : null;
}

/**
 * Editor text split into its name and the text after `name:: `. The editor keeps a backslash
 * before the `::` of text that would otherwise read as named; that text has no name, and the
 * backslash isn't part of it.
 */
export function splitName(text: string): { name: string | null; rest: string } {
  const escape = text.indexOf(String.raw`\::`);
  if (escape !== -1) {
    const unescaped = text.slice(0, escape) + text.slice(escape + 1);
    const name = nameOf(unescaped);
    if (name !== null && name.length === escape) return { name: null, rest: unescaped };
  }
  const name = nameOf(text);
  if (name === null) return { name: null, rest: text };
  return { name, rest: text.slice(name.length + 2).replace(/^\s/, '') };
}

/** The editor text holding a name and the text after it. */
export function joinName(name: string | null, text: string): string {
  if (name !== null) return `${name}:: ${text}`.trimEnd();
  const looksNamed = nameOf(text);
  return looksNamed === null ? text : `${looksNamed}\\${text.slice(looksNamed.length)}`;
}

const sortMarks = (marks: Iterable<Mark>): Mark[] => [...new Set(marks)].sort();
const isSpace = (char: string) => /^\s$/u.test(char);

function sharedMarks(link: Extract<Run, { kind: 'link' }>): Set<Mark> {
  const texts = link.runs.filter((run) => run.kind === 'text');
  if (texts.length === 0) return new Set();
  const shared = new Set(texts[0]!.marks);
  for (const run of texts.slice(1)) {
    for (const mark of shared) if (!run.marks.includes(mark)) shared.delete(mark);
  }
  shared.delete('code');
  return shared;
}

type Piece = { char: string; marks: Set<Mark> } | { link: Extract<Run, { kind: 'link' }>; marks: Set<Mark> };

/** Whitespace at the edge of a marked span carries no mark, and neighbours with equal marks merge. */
export function normalizeRuns(runs: readonly Run[]): Run[] {
  const out: Run[] = [];
  let segment: Piece[] = [];
  const flush = () => {
    for (const mark of EDGE_MARKS) {
      let index = 0;
      while (index < segment.length) {
        if (!segment[index]!.marks.has(mark)) {
          index += 1;
          continue;
        }
        let end = index;
        while (end < segment.length && segment[end]!.marks.has(mark)) end += 1;
        for (let i = index; i < end; i += 1) {
          const piece = segment[i]!;
          if (!('char' in piece) || !isSpace(piece.char)) break;
          piece.marks.delete(mark);
        }
        for (let i = end - 1; i >= index; i -= 1) {
          const piece = segment[i]!;
          if (!('char' in piece) || !isSpace(piece.char)) break;
          piece.marks.delete(mark);
        }
        index = end;
      }
    }
    for (const piece of segment) {
      if (!('char' in piece)) {
        out.push(piece.link);
        continue;
      }
      const marks = sortMarks(piece.marks);
      const previous = out.at(-1);
      if (previous?.kind === 'text' && previous.marks.join() === marks.join()) previous.text += piece.char;
      else out.push({ kind: 'text', text: piece.char, marks });
    }
    segment = [];
  };
  for (const run of runs) {
    if (run.kind === 'text') {
      for (const char of run.text) segment.push({ char, marks: new Set(run.marks) });
    } else if (run.kind === 'link') {
      const link = { ...run, runs: normalizeRuns(run.runs) };
      segment.push({ link, marks: sharedMarks(link) });
    } else {
      flush();
      out.push(run);
    }
  }
  flush();
  return out;
}

/** Whitespace at a text's edges isn't text, but a code span's own spaces are its content. */
export function trimRuns(runs: readonly Run[]): Run[] {
  const copy = runs.map((run) => ({ ...run }));
  const first = copy[0];
  if (first?.kind === 'text' && !first.marks.includes('code')) first.text = first.text.trimStart();
  const last = copy.at(-1);
  if (last?.kind === 'text' && !last.marks.includes('code')) last.text = last.text.trimEnd();
  return copy.filter((run) => run.kind !== 'text' || run.text !== '');
}

/** Verbatim source as the reader keeps it: continuation lines start at their text. */
export function trimVerbatim(source: string): string {
  return source.trim().split('\n').map((line) => line.trimStart()).join('\n');
}
