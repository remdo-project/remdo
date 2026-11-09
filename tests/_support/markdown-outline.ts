import MarkdownIt from 'markdown-it';
import type { Token } from 'markdown-it';

/** A note a test expects, read from Markdown in the RemDo text format. */
export interface MarkdownNote {
  text?: string;
  checked?: true;
  id?: string;
  children?: MarkdownNote[];
}

/** A note's position: its index under each ancestor, from the top level down. */
export type NotePath = number[];

export interface MarkdownPoint {
  note: NotePath;
  offset: number;
}

/** The selection a document marks with `<selection>` tags. */
export type MarkdownSelection =
  | { state: 'caret'; at: MarkdownPoint }
  | { state: 'inline'; anchor: MarkdownPoint; focus: MarkdownPoint }
  | { state: 'structural'; notes: NotePath[] };

export interface MarkdownOutline {
  notes: MarkdownNote[];
  selection: MarkdownSelection | null;
}

const markdown = new MarkdownIt('commonmark');
const TAG = /<selection\s*\/>|<selection>|<\/selection>/g;
const MARKER = /^\s*(?:[-*+]|\d+[.)])(?:\s+\[([ x])\])?(?:\s+|$)/;
const ID_NOTE = /^id::\s*(\S+)$/;

interface Mark {
  kind: 'caret' | 'open' | 'close';
  line: number;
  column: number;
}

interface Located {
  note: MarkdownNote;
  path: NotePath;
  line: number;
  contentColumn: number;
}

/**
 * Reads an outline from Markdown, and the selection its `<selection>` tags mark: an empty tag is a
 * caret, a tag wrapping text in one note is a range, and tags on their own lines around whole notes
 * are a note range. Tags are removed before parsing, so they may sit anywhere.
 */
export function readMarkdownOutline(source: string): MarkdownOutline {
  const lines: string[] = [];
  const marks: Mark[] = [];
  const blockStarts: number[] = [];
  const blockEnds: number[] = [];
  for (const raw of dedent(source).split('\n')) {
    const trimmed = raw.trim();
    if (trimmed === '<selection>') {
      blockStarts.push(lines.length);
      continue;
    }
    if (trimmed === '</selection>') {
      blockEnds.push(lines.length);
      continue;
    }
    let line = '';
    let last = 0;
    for (const match of raw.matchAll(TAG)) {
      line += raw.slice(last, match.index);
      const kind = match[0] === '</selection>' ? 'close' : match[0] === '<selection>' ? 'open' : 'caret';
      marks.push({ kind, line: lines.length, column: line.length });
      last = match.index + match[0].length;
    }
    lines.push(line + raw.slice(last));
  }

  const located: Located[] = [];
  const notes = readList(markdown.parse(lines.join('\n'), {}), lines, located);
  return { notes, selection: readSelection(marks, blockStarts, blockEnds, located, lines) };
}

function dedent(source: string): string {
  const lines = source.replace(/^\n/, '').replace(/\n\s*$/, '').split('\n');
  const indent = Math.min(...lines.filter((line) => line.trim()).map((line) => /^ */.exec(line)![0].length));
  return lines.map((line) => line.slice(indent)).join('\n');
}

interface Frame {
  /** The note this list item holds; null for the document and for ID notes. */
  note: MarkdownNote | null;
  children: MarkdownNote[];
  path: NotePath;
  checkbox?: boolean;
}

function readList(tokens: Token[], lines: string[], located: Located[]): MarkdownNote[] {
  const top: MarkdownNote[] = [];
  const frames: Frame[] = [{ note: null, children: top, path: [] }];
  for (const token of tokens) {
    const frame = frames.at(-1)!;
    if (token.type === 'list_item_open') {
      const line = token.map![0];
      const marker = MARKER.exec(lines[line]!)!;
      const id = ID_NOTE.exec(lines[line]!.slice(marker[0].length).trim());
      if (id && frame.note) {
        frame.note.id = id[1]!;
        frames.push({ note: null, children: [], path: frame.path });
        continue;
      }
      const note: MarkdownNote = marker[1] === 'x' ? { checked: true } : {};
      const path = [...frame.path, frame.children.length];
      frame.children.push(note);
      located.push({ note, path, line, contentColumn: marker[0].length });
      frames.push({ note, children: [], path, checkbox: marker[1] !== undefined });
    } else if (token.type === 'list_item_close') {
      const closed = frames.pop()!;
      if (closed.note && closed.children.length > 0) closed.note.children = closed.children;
    } else if (token.type === 'inline' && frame.note && frame.note.text === undefined) {
      // CommonMark keeps a task checkbox in the item's text; the marker already recorded it.
      const text = plainText(token.children ?? []).replace(frame.checkbox ? /^\[[ x]\] ?/ : /^$/, '');
      if (text) frame.note.text = text;
    }
  }
  return top;
}

function plainText(tokens: Token[]): string {
  return tokens.map((token) => (token.type === 'text' || token.type === 'code_inline' ? token.content : '')).join('');
}

function offsetIn(located: Located, lines: string[], column: number): number {
  const prefix = lines[located.line]!.slice(located.contentColumn, column);
  return plainText(markdown.parseInline(prefix, {})[0]?.children ?? []).length;
}

function noteAt(located: Located[], line: number): Located {
  const found = located.find((entry) => entry.line === line);
  if (!found) throw new Error(`<selection> must sit on a note's own line; line ${line + 1} holds no note.`);
  return found;
}

function readSelection(
  marks: Mark[],
  blockStarts: number[],
  blockEnds: number[],
  located: Located[],
  lines: string[],
): MarkdownSelection | null {
  if (blockStarts.length > 0 || blockEnds.length > 0) {
    if (blockStarts.length !== 1 || blockEnds.length !== 1 || marks.length > 0) {
      throw new Error('A note range needs one <selection> line before it, one </selection> line after it, and no other tags.');
    }
    const covered = located.filter((entry) => entry.line >= blockStarts[0]! && entry.line < blockEnds[0]!);
    if (covered.length === 0) throw new Error('A note range must wrap at least one note.');
    return { state: 'structural', notes: covered.map((entry) => entry.path) };
  }
  if (marks.length === 0) return null;
  const point = (mark: Mark): MarkdownPoint => {
    const entry = noteAt(located, mark.line);
    return { note: entry.path, offset: offsetIn(entry, lines, mark.column) };
  };
  if (marks.length === 1 && marks[0]!.kind === 'caret') return { state: 'caret', at: point(marks[0]!) };
  if (marks.length === 2 && marks[0]!.kind === 'open' && marks[1]!.kind === 'close' && marks[0]!.line === marks[1]!.line) {
    return { state: 'inline', anchor: point(marks[0]!), focus: point(marks[1]!) };
  }
  throw new Error('Mark a caret with <selection />, a range within one note with <selection>…</selection>, or whole notes with tags on their own lines.');
}
