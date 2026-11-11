import type { SerializedEditorState } from 'lexical';

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
      if (item.inlineMarkdown) throw new Error(`Fixture notes hold plain text for now; "${note.text}" holds inline Markdown.`);
      if (note.body !== undefined) throw new Error(`Fixture notes hold no body for now; "${note.text}" has one.`);
      if (note.folded && !note.children) throw new Error(`Only a note with children folds; "${note.text}" has none.`);
      children.push({
        type: 'listitem',
        noteId: ids.get(note)!,
        value,
        indent: depth,
        ...(kind === 'check' && { checked: note.checked === true }),
        ...(note.checked && { checkState: true }),
        ...(note.folded && { folded: true }),
        children: note.text ? [{ type: 'text', text: note.text }] : [],
      });
      value += 1;
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

function listKind(items: MarkdownItem[]): 'bullet' | 'number' | 'check' {
  const ordered = items.every((item) => item.ordered);
  const checkboxes = items.every((item) => item.checkbox);
  if (!ordered && items.some((item) => item.ordered)) throw new Error('A fixture list is either numbered or not.');
  if (!checkboxes && items.some((item) => item.checkbox)) throw new Error('A fixture check list gives every note a checkbox.');
  if (ordered && checkboxes) throw new Error('A fixture list is numbered or a check list, not both.');
  if (items[0]?.start !== undefined) throw new Error(`A fixture's numbered list starts at 1, not ${items[0].start}.`);
  return ordered ? 'number' : checkboxes ? 'check' : 'bullet';
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
  for (const note of all) {
    let id = note.id;
    if (id === undefined) {
      id = normalizeNoteId(note.text) === note.text && !used.has(note.text) ? note.text : createNoteIdAvoiding(used);
      used.add(id);
    }
    ids.set(note, id);
  }
  return ids;
}
