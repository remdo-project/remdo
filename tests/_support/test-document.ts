import type { ListItemNode, ListNode } from '@lexical/list';
import { $getState, $isTextNode } from 'lexical';
import type { Token } from 'markdown-it';
import { formatDateNodeLabel } from '#client/editor/features/date/date-label';
import { isValidIsoDate } from '#client/editor/features/date/date-node';
import { markerState } from '#client/editor/features/list-types/note-marker';
import { $isNoteFolded, $setNoteFolded } from '#client/editor/outline/fold-state';
import { getContentSiblings } from '#client/editor/outline/list-structure';
import { $resolveRootContentList } from '#client/editor/outline/schema';
import { getNestedList } from '#client/editor/outline/selection/tree';
import { $applyTree } from '../../src/headless/outline-tree/apply';
import { $readTree } from '../../src/headless/outline-tree/read';
import { isPlainText, nameOf, normalizeRuns, splitName, trimRuns } from '../../src/headless/outline-tree/runs';
import type { Document, Mark, Marker, OutlineNote, Run, TreeNote } from '../../src/headless/outline-tree/tree';
import type { MarkdownItem, MarkdownNote, MarkdownPoint, MarkdownSelection, NotePath } from './markdown-outline';
import { readMarkdownOutline, withContent } from './markdown-outline';

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
  const textAt = new Map<string, WrittenText>();
  const outline = (siblings: MarkdownNote[], path: NotePath): TreeNote[] => {
    const children: TreeNote[] = [];
    siblings.forEach((note, index) => {
      const item = items.get(note)!;
      const notePath = [...path, index];
      const text = textOf(item);
      textAt.set(notePath.join('.'), { item, escape: escapeOf(text), ...keptOf(item, text.name) });
      if (note.folded) folded.push(notePath);
      const previous = children.at(-1);
      children.push({
        kind: 'outline',
        marker: markerOf(item, previous?.kind === 'outline' && previous.marker.kind === 'number'),
        checkbox: item.checkbox ? (note.checked ? 'checked' : 'open') : null,
        ...text,
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
  return { document, folded, selection: selection && inEditorOffsets(selection, (path) => textAt.get(path.join('.'))!) };
}

interface WrittenText {
  item: MarkdownItem;
  /** Where the editor writes a backslash before the `::` of unnamed text that would read as named. */
  escape: number | null;
  /** Where the text the note keeps after its name starts and ends, as the Markdown's offsets count. */
  from: number;
  to: number;
  /** Where that text starts in the editor. */
  at: number;
}

// The tree drops whitespace written at the text's edges, so an offset there points at the kept text's edge.
function keptOf(item: MarkdownItem, name: string | null): Pick<WrittenText, 'from' | 'to' | 'at'> {
  const { rest } = splitName(item.content);
  const read = (item.inline ?? []).reduce((length, token) => length + (token.type === 'text' || token.type === 'code_inline' ? token.content.length : 0), 0);
  const start = name === null ? 0 : item.content.length - rest.length;
  const from = Math.min(start + /^\s*/.exec(rest)![0].length, read);
  const to = Math.max(from, read - /\s*$/.exec(rest)![0].length);
  return { from, to, at: name === null ? 0 : name.length + 2 + (from < to ? 1 : 0) };
}

function escapeOf({ name, runs: [first] }: Pick<OutlineNote, 'name' | 'runs'>): number | null {
  return name === null && isPlainText(first) ? nameOf(first.text)?.length ?? null : null;
}

/**
 * A selection whose offsets count the text as the editor holds it: each date as its label, a name's
 * escape, and none of the edge whitespace the tree drops.
 */
function inEditorOffsets(selection: MarkdownSelection, textAt: (path: NotePath) => WrittenText): MarkdownSelection {
  const point = ({ note, offset }: MarkdownPoint): MarkdownPoint => ({ note, offset: editorOffset(textAt(note), offset) });
  if (selection.state === 'caret') return { state: 'caret', at: point(selection.at) };
  if (selection.state === 'inline') return { state: 'inline', start: point(selection.start), end: point(selection.end) };
  return selection;
}

function editorOffset({ item, escape, from, to, at }: WrittenText, written: number): number {
  if (written < at) return written;
  const offset = Math.min(Math.max(written, from), to);
  let read = 0;
  let shift = at - from + (escape !== null && offset - from > escape ? 1 : 0);
  let date: { start: number; iso: string } | null = null;
  for (const token of item.inline ?? []) {
    const iso = token.type === 'link_open' ? dateOf(token) : null;
    if (iso !== null) {
      date = { start: read, iso };
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

const MARKS = new Map<string, Mark>([['strong', 'bold'], ['em', 'italic'], ['s', 'strike']]);

const plain = (text: string): Run => ({ kind: 'text', text, marks: [] });

const withEdges = (runs: readonly Run[], lead: string, tail: string): Run[] => normalizeRuns([plain(lead), ...runs, plain(tail)]);

/**
 * A note's name and runs as Python's reader reads them (`fill` in text_format.py). Markdown drops
 * whitespace written at a note's edges, so whitespace left there after the name was stated through
 * character references, and the runs keep it.
 */
function textOf(item: MarkdownItem): Pick<OutlineNote, 'name' | 'runs'> {
  const { name, rest } = splitName(item.content);
  const tokens = name === null ? item.inline ?? [] : withoutName(item.inline ?? []);
  const read = normalizeRuns(runsOf(tokens));
  const runs = trimRuns(read);
  const edge = (run: Run | undefined, pattern: RegExp) =>
    (run?.kind === 'text' && !run.marks.includes('code') ? pattern.exec(run.text)![0] : '');
  const written = (pattern: RegExp) => pattern.exec(rest)![0].length;
  const lead = edge(read[0], /^\s*/).slice(written(/^\s*/));
  const trailing = runs.length === 0 ? '' : edge(read.at(-1), /\s*$/);
  const tail = trailing.slice(0, trailing.length - written(/\s*$/));
  return { name, runs: withEdges(runs, lead, tail) };
}

// A name holds no Markdown, so it opens the first text token.
function withoutName(tokens: Token[]): Token[] {
  const [first, ...others] = tokens;
  return first?.type === 'text' ? [withContent(first, splitName(first.content).rest), ...others] : tokens;
}

function dateOf(link: Token): string | null {
  const href = String(link.attrGet('href') ?? '');
  const iso = href.slice(5);
  // Python's reader reads year 0, which no calendar date has, as a link.
  return href.startsWith('date:') && isValidIsoDate(iso) && !iso.startsWith('0000') ? iso : null;
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
      else if (marks.includes(mark)) marks.splice(marks.lastIndexOf(mark), 1);
    } else if (token.type === 'text') {
      text(token.content);
    } else if (token.type === 'code_inline') {
      text(token.content, ['code']);
    } else if (token.type === 'link_open' && token.markup === 'autolink') {
      // Python's reader keeps a note with an autolink as verbatim source.
      throw new Error('A test document\'s note text can\'t hold autolinks yet.');
    } else if (token.type === 'link_open') {
      const date = dateOf(token);
      if (date !== null) {
        // A date's label is presentation: it reads as its date.
        top.push({ kind: 'date', date });
        inDate = true;
      } else {
        const link: Run = { kind: 'link', href: String(token.attrGet('href') ?? ''), runs: [] };
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
  const notes = outlineNotesByPath(document.children);
  const folded: NotePath[] = [];
  for (const { path, item } of $outlineItems()) {
    if ($isNoteFolded(item)) folded.push(path);
    const note = notes.get(path.join('.'));
    if (note && note.runs[0]?.kind !== 'verbatim') note.runs = withEdges(note.runs, ...$edgesOf(item, note.name));
  }
  return { document, folded };
}

function outlineNotesByPath(notes: readonly TreeNote[], path: NotePath = [], found = new Map<string, OutlineNote>()) {
  notes.filter((note) => note.kind === 'outline').forEach((note, index) => {
    const notePath = [...path, index];
    found.set(notePath.join('.'), note);
    outlineNotesByPath(note.children, notePath, found);
  });
  return found;
}

const OPAQUE = '\uFFFC';

// The whitespace at a note's edges, after any name, that reading its tree drops: plain text outside
// links and code.
function $edgesOf(item: ListItemNode, name: string | null): [string, string] {
  const content = item.getChildren().map((node) => ($isTextNode(node) && !node.hasFormat('code') ? node.getTextContent() : OPAQUE)).join('');
  const text = name === null ? content : content.slice(name.length + 2).replace(/^\s/, '');
  const lead = /^\s*/.exec(text)![0];
  if (lead.length === text.length) return [lead, ''];
  return [lead, /\s*$/.exec(text)![0]];
}
