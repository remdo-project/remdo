import type { SerializedEditorState } from 'lexical';
import type { Token } from 'markdown-it';

import { createNoteIdAvoiding, normalizeNoteId } from '#domain/notes/ids';
import { restoreEditorStateDefaults } from '#tools/editor-state-defaults';
import type { MarkdownItem, MarkdownNote } from './markdown-outline';
import { readMarkdownOutline } from './markdown-outline';
import { flattenOutline } from './outline';

interface SerializedNode {
  type: string;
  [key: string]: unknown;
}

export function buildFixtureState(source: string): SerializedEditorState {
  const { notes, items, selection } = readMarkdownOutline(source);
  if (selection) throw new Error('A fixture holds no selection.');
  const ids = assignIds(notes);
  const list = (siblings: MarkdownNote[], depth: number): SerializedNode => {
    const kind = listKind(siblings.map((note) => items.get(note)!));
    const children: SerializedNode[] = [];
    let value = 1;
    for (const note of siblings) {
      const item = items.get(note)!;
      if (note.folded && !note.children) throw new Error(`Only a note with children folds; "${note.text}" has none.`);
      children.push({
        type: 'listitem',
        noteId: ids.get(note)!,
        value,
        indent: depth,
        ...(kind === 'check' && { checked: note.checked === true }),
        ...(note.checked && { checkState: true }),
        ...(note.folded && { folded: true }),
        children: item.inline ? inlineNodes(item.inline, item.checkbox, note.text ?? '') : note.text ? [{ type: 'text', text: note.text }] : [],
      });
      value += 1;
      if (item.bodyLines) {
        children.push({
          type: 'note-body-wrapper',
          indent: depth,
          children: [{ type: 'note-body', children: bodyNodes(item.bodyLines, note.body!) }],
        });
        value += 1;
      }
      if (note.children) {
        children.push({
          type: 'listitem',
          value,
          indent: depth,
          ...(kind === 'check' && { checked: false }),
          children: [list(note.children, depth + 1)],
        });
      }
    }
    return {
      type: 'list',
      listType: kind,
      tag: kind === 'number' ? 'ol' : 'ul',
      children,
    };
  };
  const root = { type: 'root', children: notes.length > 0 ? [list(notes, 0)] : [] };
  return restoreEditorStateDefaults({ root } as unknown as SerializedEditorState);
}

const FORMAT_BITS: Record<string, number> = { strong: 1, em: 2, s: 4 };
const UNDERLINE = 8;
const CODE = 16;

function inlineNodes(tokens: Token[], checkbox: boolean, text: string): SerializedNode[] {
  const top: SerializedNode[] = [];
  let target = top;
  let format = 0;
  let link: SerializedNode | null = null;
  let plain = '';
  const pushText = (content: string, extra = 0) => {
    if (!content) return;
    plain += content;
    if (link?.type === 'date') return;
    target.push({ type: 'text', text: content, ...((format | extra) !== 0 && { format: format | extra }) });
  };
  for (const [index, token] of tokens.entries()) {
    const kind = token.type.replace(/_(?:open|close)$/, '');
    if (kind in FORMAT_BITS) {
      format ^= FORMAT_BITS[kind]!;
    } else if (token.type === 'html_inline') {
      format ^= UNDERLINE;
    } else if (token.type === 'code_inline') {
      pushText(token.content, CODE);
    } else if (token.type === 'text') {
      pushText(index === 0 && checkbox ? token.content.replace(/^\[[ x]\] ?/, '') : token.content);
    } else if (token.type === 'link_open') {
      link = linkNode(String(token.attrGet('href') ?? ''));
      top.push(link);
      target = (link.children as SerializedNode[] | undefined) ?? [];
    } else if (token.type === 'link_close') {
      link = null;
      target = top;
    } else {
      throw new Error(`Fixture note text can't hold ${token.type} yet.`);
    }
  }
  if (plain !== text) throw new Error(`Fixture note "${text}" reads differently once built: "${plain}".`);
  return top;
}

function bodyNodes(lines: Token[][], body: string): SerializedNode[] {
  const texts = body.split('\n');
  return lines.flatMap((tokens, index) => [
    ...(index > 0 ? [{ type: 'linebreak' }] : []),
    ...inlineNodes(tokens, false, texts[index]!),
  ]);
}

function linkNode(href: string): SerializedNode {
  const date = /^date:(\d{4}-\d{2}-\d{2})$/.exec(href);
  if (date) return { type: 'date', isoDate: date[1] };
  const note = /^note:(?:([^_]+)_)?([^_]+)$/.exec(href);
  if (!note) throw new Error(`Fixture links point to note: or date: targets, not ${href}.`);
  return { type: 'note-link', noteId: note[2], ...(note[1] !== undefined && { docId: note[1] }), children: [] };
}

function listKind(items: MarkdownItem[]): 'bullet' | 'number' | 'check' {
  const ordered = items.every((item) => item.ordered);
  if (!ordered && items.some((item) => item.ordered)) throw new Error('A fixture list is either numbered or not.');
  if (items[0]?.start !== undefined) throw new Error(`A fixture's numbered list starts at 1, not ${items[0].start}.`);
  return ordered ? 'number' : items.every((item) => item.checkbox) ? 'check' : 'bullet';
}

function assignIds(notes: MarkdownNote[]): Map<MarkdownNote, string> {
  const all = flattenOutline(notes);
  const used = new Set<string>();
  for (const { id } of all) {
    if (id === undefined) continue;
    if (normalizeNoteId(id) !== id) throw new Error(`A fixture's id:: ${id} isn't a valid note ID.`);
    if (used.has(id)) throw new Error(`Two fixture notes declare id:: ${id}.`);
    used.add(id);
  }
  const ids = new Map<MarkdownNote, string>();
  let generated = 0;
  const nextId = () => `n${generated += 1}`;
  for (const note of all) {
    let id = note.id;
    if (id === undefined) {
      id = normalizeNoteId(note.text) === note.text && !used.has(note.text) ? note.text : createNoteIdAvoiding(used, nextId);
      used.add(id);
    }
    ids.set(note, id);
  }
  return ids;
}
