import type { SerializedEditorState } from 'lexical';

import { createNoteIdAvoiding, normalizeNoteId } from '#domain/notes/ids';
import type { MarkdownItem, MarkdownNote } from './markdown-outline';
import { readMarkdownOutline } from './markdown-outline';

interface SerializedNode {
  type: string;
  [key: string]: unknown;
}

/**
 * Builds the editor state a fixture's test document describes, in the compact form fixture JSON used:
 * defaults left out, and a note without an `id::` line identified by its text when that is a valid,
 * unused ID.
 */
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
      if (item.markup) throw new Error(`Fixture notes hold plain text for now; "${note.text}" holds inline Markdown.`);
      if (note.body !== undefined) throw new Error(`Fixture notes hold no body for now; "${note.text}" has one.`);
      children.push({
        type: 'listitem',
        noteId: ids.get(note)!,
        value,
        ...(depth > 0 && { indent: depth }),
        ...(kind === 'check' && { checked: note.checked === true }),
        ...(note.folded && { folded: true }),
        children: note.text ? [{ type: 'text', text: note.text }] : [],
      });
      value += 1;
      if (note.children) {
        children.push({
          type: 'listitem',
          value,
          ...(depth > 0 && { indent: depth }),
          children: [list(note.children, depth + 1)],
        });
      }
    }
    return {
      type: 'list',
      ...(kind === 'number' && { listType: 'number', tag: 'ol' }),
      ...(kind === 'check' && { listType: 'check' }),
      children,
    };
  };
  return { root: { type: 'root', children: notes.length > 0 ? [list(notes, 0)] : [] } } as unknown as SerializedEditorState;
}

function listKind(items: MarkdownItem[]): 'bullet' | 'number' | 'check' {
  const ordered = items.every((item) => item.ordered);
  const checkboxes = items.every((item) => item.checkbox);
  if (!ordered && items.some((item) => item.ordered)) throw new Error('A fixture list is either numbered or not.');
  if (!checkboxes && items.some((item) => item.checkbox)) throw new Error('A fixture check list gives every note a checkbox.');
  if (ordered && checkboxes) throw new Error('A fixture list is numbered or a check list, not both.');
  return ordered ? 'number' : checkboxes ? 'check' : 'bullet';
}

function assignIds(notes: MarkdownNote[]): Map<MarkdownNote, string> {
  const all: MarkdownNote[] = [];
  const walk = (siblings: MarkdownNote[]) => {
    for (const note of siblings) {
      all.push(note);
      if (note.children) walk(note.children);
    }
  };
  walk(notes);
  const used = new Set<string>();
  for (const { id } of all) {
    if (id === undefined) continue;
    if (used.has(id)) throw new Error(`Two fixture notes declare id:: ${id}.`);
    used.add(id);
  }
  const ids = new Map<MarkdownNote, string>();
  for (const note of all) {
    let id = note.id;
    if (id === undefined) {
      const fromText = note.text !== undefined && normalizeNoteId(note.text) === note.text ? note.text : undefined;
      id = fromText !== undefined && !used.has(fromText) ? fromText : createNoteIdAvoiding(used);
      used.add(id);
    }
    ids.set(note, id);
  }
  return ids;
}
