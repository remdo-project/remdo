import type { SerializedEditorState } from 'lexical';

import { reportInvariant } from '@/editor/invariant';

import type { SerializedOutlineNote } from './traverseSerializedOutline';
import { traverseSerializedOutline } from './traverseSerializedOutline';

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

export function collectOutlineEntries(state: SerializedEditorState): FlatOutlineEntry[] | null {
  const { notes, valid } = traverseSerializedOutline(state);
  if (!valid) {
    return null;
  }
  const entries: FlatOutlineEntry[] = [];
  flattenNotes(notes, entries);
  return entries;
}

export function assertEditorSchema(state: SerializedEditorState): void {
  const entries = collectOutlineEntries(state);
  if (!entries) {
    return;
  }

  const stack: Array<{ indent: number }> = [{ indent: -1 }];

  for (const entry of entries) {
    const parentIndent = stack.at(-1)!.indent;
    if (entry.indent > parentIndent + 1) {
      reportInvariant({
        message: `indent-jump path=${entry.path} parentIndent=${parentIndent} entryIndent=${entry.indent}`,
      });
    }

    while (stack.length > 0 && stack.at(-1)!.indent >= entry.indent) {
      stack.pop();
    }

    stack.push({ indent: entry.indent });
  }
}
