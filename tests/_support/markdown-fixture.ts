import { IS_BOLD, IS_CODE, IS_ITALIC, IS_STRIKETHROUGH, IS_UNDERLINE } from 'lexical';
import type { SerializedEditorState } from 'lexical';
import type { Token } from 'markdown-it';

import { createNoteIdAvoiding, normalizeNoteId } from '#domain/notes/ids';
import { parseDocumentRef } from '#document-routes';
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
    const kind = listKind(siblings, items);
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
        children: inlineNodes(item.inline ?? []),
      });
      value += 1;
      if (item.bodyLines) {
        children.push({
          type: 'note-body-wrapper',
          indent: depth,
          children: [{ type: 'note-body', children: bodyNodes(item.bodyLines) }],
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

const MARK_FORMATS = new Map([['strong', IS_BOLD], ['em', IS_ITALIC], ['s', IS_STRIKETHROUGH]]);

function inlineNodes(tokens: Token[]): SerializedNode[] {
  const top: SerializedNode[] = [];
  let target = top;
  const marks: number[] = [];
  const pushText = (text: string, extra = 0) => {
    if (!text) return;
    const format = marks.reduce((all, mark) => all | mark, extra);
    const previous = target.at(-1);
    // Lexical merges neighbouring text nodes of one format, so the built state does too.
    if (previous?.type === 'text' && (previous.format ?? 0) === format) previous.text += text;
    else target.push({ type: 'text', text, ...(format !== 0 && { format }) });
  };
  for (const token of tokens) {
    const mark = token.type === 'html_inline' ? IS_UNDERLINE : MARK_FORMATS.get(token.type.replace(/_(?:open|close)$/, ''));
    if (mark !== undefined) {
      const opens = token.type === 'html_inline' ? token.content === '<u>' : token.nesting === 1;
      if (opens) marks.push(mark);
      else if (marks.includes(mark)) marks.splice(marks.lastIndexOf(mark), 1);
      else throw new Error('Fixture note text closes </u> before opening it.');
    } else if (token.type === 'code_inline') {
      pushText(token.content, IS_CODE);
    } else if (token.type === 'text') {
      pushText(token.content);
    } else if (token.type === 'link_open') {
      const link = linkNode(String(token.attrGet('href') ?? ''));
      top.push(link);
      // A date's label is derived from its date, so its text goes nowhere.
      target = (link.children as SerializedNode[] | undefined) ?? [];
    } else if (token.type === 'link_close') {
      target = top;
    } else {
      throw new Error(`Fixture note text can't hold ${token.type} yet.`);
    }
  }
  if (marks.includes(IS_UNDERLINE)) throw new Error('Fixture note text opens <u> without closing it.');
  return top;
}

function bodyNodes(lines: Token[][]): SerializedNode[] {
  return lines.flatMap((tokens, index) => [...(index > 0 ? [{ type: 'linebreak' }] : []), ...inlineNodes(tokens)]);
}

function linkNode(href: string): SerializedNode {
  const date = /^date:(\d{4}-\d{2}-\d{2})$/.exec(href);
  if (date) return { type: 'date', isoDate: date[1] };
  const target = /^note:(.+)$/.exec(href)?.[1] ?? '';
  const ref = target.includes('_') ? parseDocumentRef(target) : { docId: null, noteId: normalizeNoteId(target) };
  if (!ref?.noteId) {
    throw new Error(`Fixture links point to note:<id>, note:<documentId>_<id> or date:<YYYY-MM-DD>, not ${href}.`);
  }
  return { type: 'note-link', noteId: ref.noteId, ...(ref.docId !== null && { docId: ref.docId }), children: [] };
}

function listKind(notes: MarkdownNote[], items: Map<MarkdownNote, MarkdownItem>): 'bullet' | 'number' | 'check' {
  const listed = notes.map((note) => items.get(note)!);
  const ordered = listed.every((item) => item.ordered);
  if (!ordered && listed.some((item) => item.ordered)) throw new Error('A fixture list is either numbered or not.');
  if (listed[0]?.start !== undefined) throw new Error(`A fixture's numbered list starts at 1, not ${listed[0].start}.`);
  if (!ordered && listed.every((item) => item.checkbox)) return 'check';
  const open = notes.find((note) => items.get(note)!.checkbox && !note.checked);
  if (open) throw new Error(`An open checkbox only fits a check list, where every note has one; "${open.text}" sits elsewhere.`);
  return ordered ? 'number' : 'bullet';
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
