import type { NoteId, NoteListType, OpenDocumentNote } from '#note-sdk';

const escapeLabel = (text: string) => text.replaceAll(/[\\[\]]/g, String.raw`\$&`);

interface Level {
  notes: readonly OpenDocumentNote[];
  next: number;
  listType: NoteListType;
  indent: string;
}

/**
 * Renders `notes` and their descendants as a nested Markdown list whose labels
 * link to each note, leaving a note unlinked when `noteUrl` returns null. The
 * listed notes are level 1; a note on the last of `depth` levels reports how
 * many children it hides.
 */
export function renderOutline(
  notes: readonly OpenDocumentNote[],
  noteUrl: (noteId: NoteId) => string | null,
  { depth = Infinity }: { depth?: number } = {},
): string {
  const lines: string[] = [];
  const levels: Level[] = [{ notes, next: 0, listType: 'bullet', indent: '' }];
  while (levels.length > 0) {
    const level = levels.at(-1)!;
    const note = level.notes[level.next++];
    if (!note) {
      levels.pop();
      continue;
    }
    const { listType, indent } = level;
    const marker = listType === 'number' ? '1.' : '-';
    // eslint-disable-next-line no-restricted-syntax -- SDK note read, not Lexical's list item state.
    const checkbox = note.getChecked() ? ' [x]' : listType === 'check' ? ' [ ]' : '';
    const label = escapeLabel(note.getText());
    const url = noteUrl(note.getId());
    const children = note.getChildren();
    const hidden = levels.length >= depth && children.length > 0
      ? ` *(${children.length} ${children.length === 1 ? 'child' : 'children'} not shown)*`
      : '';
    lines.push(`${indent}${marker}${checkbox} ${url === null ? label : `[${label}](${url})`}${hidden}`);
    const childIndent = `${indent}${' '.repeat(marker.length + 1)}`;
    for (const line of note.getBody()?.split('\n') ?? []) lines.push(`${childIndent}>${line ? ` ${line}` : ''}`);
    if (levels.length < depth) {
      levels.push({ notes: children, next: 0, listType: note.getChildListType() ?? 'bullet', indent: childIndent });
    }
  }
  return lines.join('\n');
}
