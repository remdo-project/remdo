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
  | { state: 'inline'; start: MarkdownPoint; end: MarkdownPoint }
  | { state: 'structural'; notes: NotePath[] };

export interface MarkdownOutline {
  notes: MarkdownNote[];
  selection: MarkdownSelection | null;
}

const markdown = new MarkdownIt('commonmark');
const TAG = /<selection\s*\/>|<selection>|<\/selection>/g;
const MARKER = /^\s*(?:[-*+]|\d+[.)])(?:\s+\[([ x])\])?(?:\s+|$)/;
const ID_NOTE = /^id::\s*(\S+)$/;

// Inline tags become private-use characters so the note's parsed text says where they sat.
const SENTINEL = { caret: '', open: '', close: '' } as const;
type MarkKind = keyof typeof SENTINEL;
const KIND_BY_SENTINEL = new Map<string, MarkKind>(Object.entries(SENTINEL).map(([kind, char]) => [char, kind as MarkKind]));

interface Mark extends MarkdownPoint {
  kind: MarkKind;
}

interface Located {
  path: NotePath;
  line: number;
}

/**
 * Reads an outline from Markdown, and the selection its `<selection>` tags mark: an empty tag is a
 * caret, a tag wrapping text in one note is a range, and tags on their own lines around whole notes
 * are a note range.
 */
export function readMarkdownOutline(source: string): MarkdownOutline {
  const lines: string[] = [];
  const blockStarts: number[] = [];
  const blockEnds: number[] = [];
  let inlineTags = 0;
  for (const raw of dedent(source).split('\n')) {
    const trimmed = raw.trim();
    if (trimmed === '<selection>') {
      blockStarts.push(lines.length);
    } else if (trimmed === '</selection>') {
      blockEnds.push(lines.length);
    } else {
      lines.push(raw.replace(TAG, (tag) => {
        inlineTags += 1;
        return SENTINEL[tag === '</selection>' ? 'close' : tag === '<selection>' ? 'open' : 'caret'];
      }));
    }
  }

  const located: Located[] = [];
  const marks: Mark[] = [];
  const notes = readList(markdown.parse(lines.join('\n'), {}), lines, located, marks);
  if (marks.length !== inlineTags) throw new Error('<selection> must sit in a note\'s own text.');
  return { notes, selection: readSelection(marks, blockStarts, blockEnds, located) };
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
  textRead?: boolean;
}

const STRUCTURE = new Set([
  'bullet_list_open', 'bullet_list_close', 'ordered_list_open', 'ordered_list_close',
  'list_item_open', 'list_item_close', 'paragraph_open', 'paragraph_close', 'inline',
]);

function readList(tokens: Token[], lines: string[], located: Located[], marks: Mark[]): MarkdownNote[] {
  const top: MarkdownNote[] = [];
  const frames: Frame[] = [{ note: null, children: top, path: [] }];
  for (const token of tokens) {
    const frame = frames.at(-1)!;
    if (token.type === 'list_item_open') {
      if (frames.length > 1 && !frame.note) throw new Error('An id:: line can\'t hold notes.');
      const line = token.map![0];
      const marker = MARKER.exec(lines[line]!);
      if (!marker) throw new Error(`A note's line must start with its list marker: ${lines[line]}`);
      const id = ID_NOTE.exec(lines[line]!.slice(marker[0].length).trim());
      if (id && frame.note) {
        if (frame.note.id !== undefined) throw new Error(`A note holds one id:: line; it already has ${frame.note.id}.`);
        frame.note.id = id[1]!;
        frames.push({ note: null, children: [], path: frame.path });
        continue;
      }
      const note: MarkdownNote = marker[1] === 'x' ? { checked: true } : {};
      const path = [...frame.path, frame.children.length];
      frame.children.push(note);
      located.push({ path, line });
      frames.push({ note, children: [], path, checkbox: marker[1] !== undefined });
    } else if (token.type === 'list_item_close') {
      const closed = frames.pop()!;
      if (closed.note && closed.children.length > 0) closed.note.children = closed.children;
    } else if (token.type === 'heading_open' && frame.note) {
      throw new Error('A note\'s text can\'t be a heading; an empty note right after its parent\'s line needs a blank line before it.');
    } else if (!STRUCTURE.has(token.type)) {
      throw new Error(`An outline holds only list items with plain text; found ${token.type}.`);
    } else if (token.type === 'inline' && frame.note) {
      if (frame.textRead) throw new Error('A note holds one paragraph; Markdown expectations can\'t express bodies yet.');
      frame.textRead = true;
      const parsed = plainText(token.children ?? []);
      // CommonMark keeps a task checkbox in the item's text; the marker already recorded it.
      const text = takeMarks(frame.checkbox ? parsed.replace(/^\[[ x]\] ?/, '') : parsed, frame.path, marks);
      if (text) frame.note.text = text;
    }
  }
  return top;
}

function plainText(tokens: Token[]): string {
  return tokens.map((token) => {
    if (token.type === 'softbreak' || token.type === 'hardbreak') throw new Error('A note\'s text must fit on its marker\'s line.');
    if (token.type === 'html_inline' || token.type === 'image') throw new Error(`A note's text can't hold ${token.type}.`);
    return token.type === 'text' || token.type === 'code_inline' ? token.content : '';
  }).join('');
}

function takeMarks(text: string, note: NotePath, marks: Mark[]): string {
  let kept = '';
  for (const char of text) {
    const kind = KIND_BY_SENTINEL.get(char);
    if (kind) marks.push({ kind, note, offset: kept.length });
    else kept += char;
  }
  return kept;
}

function readSelection(
  marks: Mark[],
  blockStarts: number[],
  blockEnds: number[],
  located: Located[],
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
  const point = ({ note, offset }: Mark): MarkdownPoint => ({ note, offset });
  const [first, second] = marks;
  if (marks.length === 1 && first!.kind === 'caret') return { state: 'caret', at: point(first!) };
  if (marks.length === 2 && first!.kind === 'open' && second!.kind === 'close' && first!.note === second!.note) {
    return { state: 'inline', start: point(first!), end: point(second!) };
  }
  throw new Error('Mark a caret with <selection />, a range within one note with <selection>…</selection>, or whole notes with tags on their own lines.');
}
