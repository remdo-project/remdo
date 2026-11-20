import type { ListItemNode, ListNode } from '@lexical/list';
import { $getState } from 'lexical';
import type { Token } from 'markdown-it';
import { markerState } from '#client/editor/features/list-types/note-marker';
import { $setNoteFolded } from '#client/editor/outline/fold-state';
import { getContentSiblings } from '#client/editor/outline/list-structure';
import { $resolveRootContentList } from '#client/editor/outline/schema';
import { getNestedList } from '#client/editor/outline/selection/tree';
import { $applyTree } from '../../src/headless/outline-tree/apply';
import { nameOf, normalizeRuns, trimRuns } from '../../src/headless/outline-tree/runs';
import type { Document, Mark, Marker, OutlineNote, Run, TreeNote } from '../../src/headless/outline-tree/tree';
import type { MarkdownItem, MarkdownNote, MarkdownSelection, NotePath } from './markdown-outline';
import { readMarkdownOutline } from './markdown-outline';

export interface TestDocument {
  document: Document;
  /** Folded notes, by their paths over outline notes. */
  folded: NotePath[];
  selection: MarkdownSelection | null;
}

/**
 * Reads a test document as the outline tree Python's reader gives the same text. Text it can't read
 * exactly as Python does, such as headings, names or edge whitespace, is refused.
 */
export function readTestDocument(source: string): TestDocument {
  const { notes, items, selection } = readMarkdownOutline(source);
  const folded: NotePath[] = [];
  const outline = (siblings: MarkdownNote[], path: NotePath): TreeNote[] => {
    const children: TreeNote[] = [];
    siblings.forEach((note, index) => {
      const item = items.get(note)!;
      const notePath = [...path, index];
      if (note.folded) folded.push(notePath);
      const previous = children.at(-1);
      children.push({
        kind: 'outline',
        marker: markerOf(item, previous?.kind === 'outline' && previous.marker.kind === 'number'),
        checkbox: item.checkbox ? (note.checked ? 'checked' : 'open') : null,
        name: null,
        runs: runsOf(item.inline ?? []),
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
  return { document: { id: null, children: outline(notes, []) }, folded, selection };
}

// Markdown numbers a list from its start; a list right after numbered notes starts again, even at 1.
function markerOf(item: MarkdownItem, afterNumber: boolean): Marker {
  if (!item.ordered) return { kind: 'bullet' };
  const restarts = item.opensList && (item.number !== 1 || afterNumber);
  return { kind: 'number', start: restarts ? item.number : null };
}

const MARKS = new Map<string, Mark>([['strong', 'bold'], ['em', 'italic'], ['s', 'strike']]);

const textOf = (runs: readonly Run[]): string =>
  runs.map((run) => (run.kind === 'text' ? run.text : run.kind === 'link' ? textOf(run.runs) : '')).join('');

function runsOf(tokens: Token[]): Run[] {
  const top: Run[] = [];
  let target = top;
  const marks: Mark[] = [];
  const text = (content: string, extra: Mark[] = []) => {
    if (content) target.push({ kind: 'text', text: content, marks: [...marks, ...extra] });
  };
  for (const token of tokens) {
    const mark = token.type === 'html_inline' ? 'underline' : MARKS.get(token.type.replace(/_(?:open|close)$/, ''));
    if (mark !== undefined) {
      if (token.type === 'html_inline' ? token.content === '<u>' : token.nesting === 1) marks.push(mark);
      else marks.splice(marks.lastIndexOf(mark), 1);
    } else if (token.type === 'text') {
      text(token.content);
    } else if (token.type === 'code_inline') {
      text(token.content, ['code']);
    } else if (token.type === 'link_open') {
      const href = String(token.attrGet('href') ?? '');
      if (href.startsWith('date:')) throw new Error('A test document doesn\'t read dates yet.');
      const link: Run = { kind: 'link', href, runs: [] };
      top.push(link);
      target = link.runs;
    } else if (token.type === 'link_close') {
      target = top;
    } else {
      throw new Error(`A test document's note text can't hold ${token.type} yet.`);
    }
  }
  const runs = normalizeRuns(top);
  const plain = textOf(runs);
  if (nameOf(plain) !== null) throw new Error('A test document doesn\'t read names yet.');
  if (/^\s|\s$/.test(plain)) throw new Error('A test document doesn\'t read edge whitespace yet.');
  return trimRuns(runs);
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
