import MarkdownIt from 'markdown-it';
import type { Token } from 'markdown-it';

/** A note a test expects, read from Markdown in the RemDo text format. */
export interface MarkdownNote {
  text?: string;
  checked?: true;
  /** The note's body: its `>` lines before any child, taken literally and joined by line breaks. */
  body?: string;
  id?: string;
  folded?: true;
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
const PROPERTY_LINE = /^(id|folded)::(?: .*)?$/;

// Inline tags become private-use characters so the note's parsed text says where they sat.
const SENTINEL = { caret: '', open: '', close: '' } as const;
type MarkKind = keyof typeof SENTINEL;
const ANY_SENTINEL = new RegExp(`[${Object.values(SENTINEL).join('')}]`);
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

/**
 * Writes a note's text for a Markdown expectation. Spaces at its edges, which the format doesn't
 * read as text, become character references so the expectation still states them.
 */
export function markdownNoteText(text: string): string {
  return text.replace(/^\s+|\s+$/g, (run) => [...run].map((char) => `&#${char.codePointAt(0)};`).join(''));
}

function dedent(source: string): string {
  const lines = source.replace(/^\n/, '').replace(/\n\s*$/, '').split('\n');
  const indent = Math.min(...lines.filter((line) => line.trim()).map((line) => /^ */.exec(line)![0].length));
  return lines.map((line) => line.slice(indent)).join('\n');
}

interface Frame {
  /** The note this list item holds; null for the document, property lines and what they hold. */
  note: MarkdownNote | null;
  children: MarkdownNote[];
  path: NotePath;
  checkbox?: boolean;
  textRead?: boolean;
  /** Names of the properties this note's children have stated so far. */
  properties?: Set<string>;
  /** Set on the first line of a property among a note's children, the one that takes effect. */
  property?: { name: string; of: Frame };
}

const STRUCTURE = new Set([
  'bullet_list_open', 'bullet_list_close', 'ordered_list_open', 'ordered_list_close',
  'list_item_open', 'list_item_close', 'paragraph_open', 'paragraph_close', 'inline',
]);

function readList(tokens: Token[], lines: string[], located: Located[], marks: Mark[]): MarkdownNote[] {
  const top: MarkdownNote[] = [];
  const frames: Frame[] = [{ note: null, children: top, path: [] }];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    const frame = frames.at(-1)!;
    if (!frame.note && frames.length > 1) {
      readInProperty(token, frame, frames);
    } else if (token.type === 'blockquote_open' && frame.note) {
      index = readBody(tokens, index, frame, lines);
    } else if (token.type === 'list_item_open') {
      const line = token.map![0];
      const marker = MARKER.exec(lines[line]!)!;
      const content = lines[line]!.slice(marker[0].length).trim();
      const property = PROPERTY_LINE.exec([...content].filter((char) => !KIND_BY_SENTINEL.has(char)).join(''));
      if (property) {
        const name = property[1]!;
        const stated = (frame.properties ??= new Set());
        frames.push({
          note: null, children: [], path: frame.path, checkbox: marker[1] !== undefined,
          property: stated.has(name) ? undefined : { name, of: frame },
        });
        stated.add(name);
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
    } else if (token.type === 'inline') {
      if (frames.length === 1) throw new Error('Every line of an outline is a list item; found text outside any note.');
      if (frame.textRead) throw new Error('A note holds one paragraph; write a body as > lines before its children.');
      frame.textRead = true;
      const parsed = plainText(token.children ?? []);
      const text = takeMarks(withoutCheckbox(parsed, frame), frame.path, marks);
      if (text) frame.note!.text = text;
    }
  }
  return top;
}

/**
 * Follows the format's properties: only a property's first line among a note's children takes effect,
 * and whatever is nested under one is ignored. A selection tag left unread there fails the tag count.
 */
function readInProperty(token: Token, frame: Frame, frames: Frame[]): void {
  if (token.type === 'list_item_open') {
    frames.push({ note: null, children: [], path: frame.path });
  } else if (token.type === 'list_item_close') {
    frames.pop();
  } else if (token.type === 'inline' && frame.property && !frame.textRead) {
    frame.textRead = true;
    const text = withoutCheckbox(plainText(token.children ?? []), frame);
    if (ANY_SENTINEL.test(text)) throw new Error('<selection> must sit in a note\'s own text.');
    const value = text.slice(text.indexOf('::') + 2).trim();
    const note = frame.property.of.note;
    if (!note) return;
    if (frame.property.name === 'id' && /^\S+$/.test(value)) note.id = value;
    if (frame.property.name === 'folded' && value === 'true') note.folded = true;
  }
}

// CommonMark keeps a task checkbox in the item's text; the marker already recorded it.
function withoutCheckbox(text: string, frame: Frame): string {
  return frame.checkbox ? text.replace(/^\[[ x]\] ?/, '') : text;
}

/** Reads a body from its source lines and returns the index of the token that closes it. */
function readBody(tokens: Token[], open: number, frame: Frame, lines: string[]): number {
  const note = frame.note!;
  if (note.body !== undefined || frame.children.length > 0) {
    throw new Error('A note\'s body is one > block before its children; Markdown blocks among them aren\'t read yet.');
  }
  const [start, end] = tokens[open]!.map!;
  const source = lines.slice(start, end);
  if (source.some((line) => !/^\s*>/.test(line))) {
    throw new Error('Every body line starts with >, on its own line below the note\'s text.');
  }
  note.body = source.map((line) => line.replace(/^\s*> ?/, '')).join('\n');
  frame.textRead = true;
  for (let index = open + 1; ; index += 1) {
    if (tokens[index]!.type === 'blockquote_close' && tokens[index]!.level === tokens[open]!.level) return index;
  }
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
