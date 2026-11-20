import type { ListItemNode, ListNode } from '@lexical/list';
import type { LexicalNode } from 'lexical';
import { $getState, $isTextNode } from 'lexical';
import type { Token } from 'markdown-it';
import { formatDateNodeLabel } from '#client/editor/features/date/date-label';
import { markerState } from '#client/editor/features/list-types/note-marker';
import { $isNoteFolded, $setNoteFolded } from '#client/editor/outline/fold-state';
import { getContentSiblings } from '#client/editor/outline/list-structure';
import { $resolveRootContentList } from '#client/editor/outline/schema';
import { getNestedList } from '#client/editor/outline/selection/tree';
import { $applyTree } from '../../src/headless/outline-tree/apply';
import { $readTree } from '../../src/headless/outline-tree/read';
import { nameOf, normalizeRuns, trimRuns } from '../../src/headless/outline-tree/runs';
import type { Document, Mark, Marker, OutlineNote, Run, TreeNote } from '../../src/headless/outline-tree/tree';
import type { MarkdownItem, MarkdownNote, MarkdownPoint, MarkdownSelection, NotePath } from './markdown-outline';
import { readMarkdownOutline } from './markdown-outline';

export interface TestDocument {
  document: Document;
  /** Folded notes, by their paths over outline notes. */
  folded: NotePath[];
  selection: MarkdownSelection | null;
}

/**
 * Reads a test document as the outline tree Python's reader gives the same text, keeping the edge
 * whitespace character references state, which Python's reader drops. Text it can't read exactly as
 * Python does, such as headings, is refused.
 */
export function readTestDocument(source: string): TestDocument {
  const { notes, items, selection } = readMarkdownOutline(source);
  const folded: NotePath[] = [];
  const itemAt = new Map<string, MarkdownItem>();
  const outline = (siblings: MarkdownNote[], path: NotePath): TreeNote[] => {
    const children: TreeNote[] = [];
    siblings.forEach((note, index) => {
      const item = items.get(note)!;
      const notePath = [...path, index];
      itemAt.set(notePath.join('.'), item);
      if (note.folded) folded.push(notePath);
      const previous = children.at(-1);
      children.push({
        kind: 'outline',
        marker: markerOf(item, previous?.kind === 'outline' && previous.marker.kind === 'number'),
        checkbox: item.checkbox ? (note.checked ? 'checked' : 'open') : null,
        ...textOf(item),
        id: note.id ?? null,
        cacheId: null,
        children: [
          ...(item.bodySource ? [{ kind: 'body' as const, source: item.bodySource, cacheId: null }] : []),
          ...outline(note.children ?? [], notePath),
        ],
      } satisfies OutlineNote);
    });
    return children;
  };
  const document: Document = { id: null, children: outline(notes, []) };
  return { document, folded, selection: selection && inEditorOffsets(selection, (path) => itemAt.get(path.join('.'))!) };
}

/** A selection whose offsets count each date as the editor labels it, not as its Markdown label. */
function inEditorOffsets(selection: MarkdownSelection, itemAt: (path: NotePath) => MarkdownItem): MarkdownSelection {
  const point = ({ note, offset }: MarkdownPoint): MarkdownPoint => ({ note, offset: editorOffset(itemAt(note), offset) });
  if (selection.state === 'caret') return { state: 'caret', at: point(selection.at) };
  if (selection.state === 'inline') return { state: 'inline', start: point(selection.start), end: point(selection.end) };
  return selection;
}

function editorOffset(item: MarkdownItem, offset: number): number {
  let read = 0;
  let shift = 0;
  let date: { start: number; iso: string } | null = null;
  for (const token of item.inline ?? []) {
    if (read > offset) break;
    if (token.type === 'link_open' && isDate(String(token.attrGet('href')))) {
      date = { start: read, iso: String(token.attrGet('href')).slice(5) };
    } else if (token.type === 'link_close' && date) {
      const label = formatDateNodeLabel(date.iso).length;
      // An offset inside a date's label can only be one of its edges in the editor.
      if (offset > date.start && offset < read) return date.start + shift + label;
      if (offset >= read) shift += label - (read - date.start);
      date = null;
    } else if (token.type === 'text' || token.type === 'code_inline') {
      read += token.content.length;
    }
  }
  return offset + shift;
}

// Markdown numbers a list from its start; a list right after numbered notes starts again, even at 1.
function markerOf(item: MarkdownItem, afterNumber: boolean): Marker {
  if (!item.ordered) return { kind: 'bullet' };
  const restarts = item.opensList && (item.number !== 1 || afterNumber);
  return { kind: 'number', start: restarts ? item.number : null };
}

const CHECKBOX = /^\[[ x]\](?:[ \t]+|$)/i;
const DATE = /^date:(\d{4})-(\d{2})-(\d{2})$/;
const LEADING_REFERENCES = /^(?:&#(?:\d+|x[\da-f]+);)+/i;
const TRAILING_REFERENCES = /(?:&#(?:\d+|x[\da-f]+);)+$/i;
const MARKS = new Map<string, Mark>([['strong', 'bold'], ['em', 'italic'], ['s', 'strike']]);

const plain = (text: string): Run => ({ kind: 'text', text, marks: [] });

const decode = (text: string) => text.replace(/&#(x?)([\da-f]+);/gi, (_, hex: string, code: string) =>
  String.fromCodePoint(Number.parseInt(code, hex ? 16 : 10)));

/** A note's name and runs as Python's reader reads them (`fill` in text_format.py), with stated edges. */
function textOf(item: MarkdownItem): Pick<OutlineNote, 'name' | 'runs'> {
  let content = item.checkbox ? (item.content ?? '').replace(CHECKBOX, '') : (item.content ?? '');
  let tokens = item.inline ?? [];
  const name = nameOf(content);
  if (name !== null) {
    content = content.slice(name.length + 2).replace(/^\s/, '');
    tokens = withoutName(tokens, name);
  }
  const lead = /^\s*/.exec(decode(LEADING_REFERENCES.exec(content)?.[0] ?? ''))![0];
  const tail = lead.length === decode(content).length ? '' : /\s*$/.exec(decode(TRAILING_REFERENCES.exec(content)?.[0] ?? ''))![0];
  const runs = normalizeRuns([plain(lead), ...trimRuns(normalizeRuns(runsOf(tokens))), plain(tail)]);
  return { name, runs: runs.filter((run) => run.kind !== 'text' || run.text) };
}

// A name holds no Markdown, so it opens the first text token.
function withoutName(tokens: Token[], name: string): Token[] {
  const [first, ...rest] = tokens;
  if (first?.type !== 'text') return tokens;
  const stripped = Object.assign(Object.create(Object.getPrototypeOf(first) as object) as Token, first);
  stripped.content = first.content.slice(name.length + 2).replace(/^\s/, '');
  return [stripped, ...rest];
}

function runsOf(tokens: Token[]): Run[] {
  const top: Run[] = [];
  let target = top;
  let inDate = false;
  const marks: Mark[] = [];
  const text = (content: string, extra: Mark[] = []) => {
    if (content) target.push({ kind: 'text', text: content, marks: [...marks, ...extra] });
  };
  for (const token of tokens) {
    const mark = token.type === 'html_inline' ? 'underline' : MARKS.get(token.type.replace(/_(?:open|close)$/, ''));
    if (inDate) {
      inDate = token.type !== 'link_close';
    } else if (mark !== undefined) {
      if (token.type === 'html_inline' ? token.content === '<u>' : token.nesting === 1) marks.push(mark);
      else marks.splice(marks.lastIndexOf(mark), 1);
    } else if (token.type === 'text') {
      text(token.content);
    } else if (token.type === 'code_inline') {
      text(token.content, ['code']);
    } else if (token.type === 'link_open' && token.markup === 'autolink') {
      // Python's reader keeps a note with an autolink as verbatim source.
      throw new Error('A test document\'s note text can\'t hold autolinks yet.');
    } else if (token.type === 'link_open') {
      const href = String(token.attrGet('href') ?? '');
      if (isDate(href)) {
        // A date's label is presentation: it reads as its date.
        top.push({ kind: 'date', date: href.slice(5) });
        inDate = true;
      } else {
        const link: Run = { kind: 'link', href, runs: [] };
        top.push(link);
        target = link.runs;
      }
    } else if (token.type === 'link_close') {
      target = top;
    } else {
      throw new Error(`A test document's note text can't hold ${token.type} yet.`);
    }
  }
  return top;
}

function isDate(href: string): boolean {
  const match = DATE.exec(href);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Each outline note's list item by its path over outline notes, as a test document gives paths. */
export function $outlineItems(): Array<{ path: NotePath; item: ListItemNode }> {
  const found: Array<{ path: NotePath; item: ListItemNode }> = [];
  const walk = (list: ListNode, path: NotePath) => {
    let index = 0;
    for (const item of getContentSiblings(list)) {
      if ($getState(item, markerState) === 'block') continue;
      const itemPath = [...path, index];
      index += 1;
      found.push({ path: itemPath, item });
      const nested = getNestedList(item);
      if (nested) walk(nested, itemPath);
    }
  };
  const root = $resolveRootContentList();
  if (root) walk(root, []);
  return found;
}

/** Makes the editor hold a test document. Call inside an editor update. */
export function $applyTestDocument({ document, folded }: Pick<TestDocument, 'document' | 'folded'>): void {
  $applyTree(document);
  const items = new Map($outlineItems().map(({ path, item }) => [path.join('.'), item]));
  for (const path of folded) $setNoteFolded(items.get(path.join('.'))!, true);
}

/**
 * The document the editor holds, as a test document reads: its outline tree, with each note's edge
 * whitespace, and its fold state. Call inside an editor read or update.
 */
export function $readTestDocument(): Pick<TestDocument, 'document' | 'folded'> {
  const document = $readTree();
  const folded: NotePath[] = [];
  for (const { path, item } of $outlineItems()) {
    if ($isNoteFolded(item)) folded.push(path);
    const note = outlineNoteAt(document.children, path);
    const [lead, tail] = $edgesOf(item);
    if (note && (lead || tail)) {
      note.runs = normalizeRuns([plain(lead), ...note.runs, plain(tail)]).filter((run) => run.kind !== 'text' || run.text);
    }
  }
  return { document, folded };
}

function outlineNoteAt(notes: TreeNote[], path: NotePath): OutlineNote | undefined {
  let note: OutlineNote | undefined;
  let siblings = notes;
  for (const index of path) {
    note = siblings.filter((child) => child.kind === 'outline')[index];
    siblings = note?.children ?? [];
  }
  return note;
}

// The whitespace at a note's edges that reading its tree drops: plain text outside links and code.
function $edgesOf(item: ListItemNode): [string, string] {
  const edge = (nodes: readonly LexicalNode[], atStart: boolean) => {
    let found = '';
    for (const node of nodes) {
      if (!$isTextNode(node) || node.hasFormat('code')) break;
      const text = node.getTextContent();
      const space = (atStart ? /^\s*/ : /\s*$/).exec(text)![0];
      found = atStart ? found + space : space + found;
      if (space.length < text.length) break;
    }
    return found;
  };
  const children = item.getChildren();
  const lead = edge(children, true);
  if (lead.length === item.getTextContent().length) return [lead, ''];
  return [lead, edge([...children].reverse(), false)];
}
