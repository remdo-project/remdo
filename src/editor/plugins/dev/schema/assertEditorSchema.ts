import type { SerializedEditorState } from 'lexical';

import { reportInvariant } from '@/editor/invariant';

import type { SerializedOutlineNote } from './traverseSerializedOutlineOrThrow';
import { traverseSerializedOutlineOrThrow } from './traverseSerializedOutlineOrThrow';

export interface FlatOutlineEntry {
  indent: number;
  path: string;
}

function formatPath(path: number[]): string {
  return path.join('.');
}

function flattenNotes(notes: SerializedOutlineNote[], entries: FlatOutlineEntry[]): void {
  for (const note of notes) {
    entries.push({ indent: note.indent, path: formatPath(note.path) });
    if (note.children.length > 0) {
      flattenNotes(note.children, entries);
    }
  }
}

export function collectOutlineEntries(state: SerializedEditorState): FlatOutlineEntry[] {
  const entries: FlatOutlineEntry[] = [];
  const notes = traverseSerializedOutlineOrThrow(state);
  flattenNotes(notes, entries);
  return entries;
}

export function assertEditorSchema(state: SerializedEditorState): void {
  const entries = collectOutlineEntries(state);

  const stack: Array<{ indent: number }> = [{ indent: -1 }];

  for (const entry of entries) {
    const parentIndent = stack.at(-1)!.indent;
    if (entry.indent > parentIndent + 1) {
      reportInvariant({
        message: `Invalid outline structure: indent jumped from ${parentIndent} to ${entry.indent} at "${entry.path}"`,
        context: { parentIndent, entryIndent: entry.indent, path: entry.path },
      });
    }

    while (stack.length > 0 && stack.at(-1)!.indent >= entry.indent) {
      stack.pop();
    }

    stack.push({ indent: entry.indent });
  }
}

