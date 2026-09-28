import type { NoteId, NoteListType, OpenDocumentNote, OpenDocumentParentNote } from '#note-sdk';

const escapeLabel = (text: string) => text.replaceAll(/[\\[\]]/g, String.raw`\$&`);

interface Level {
  notes: readonly OpenDocumentNote[];
  next: number;
  listType: NoteListType;
  indent: string;
}

/**
 * Renders the notes under `root` as a nested Markdown list whose labels link to
 * each note, leaving a note unlinked when `noteUrl` returns null.
 */
export function renderOutline(root: OpenDocumentParentNote, noteUrl: (noteId: NoteId) => string | null): string {
  const lines: string[] = [];
  const levels: Level[] = [{ notes: root.getChildren(), next: 0, listType: 'bullet', indent: '' }];
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
    lines.push(`${indent}${marker}${checkbox} ${url === null ? label : `[${label}](${url})`}`);
    const childIndent = `${indent}${' '.repeat(marker.length + 1)}`;
    for (const line of note.getBody()?.split('\n') ?? []) lines.push(`${childIndent}>${line ? ` ${line}` : ''}`);
    levels.push({ notes: note.getChildren(), next: 0, listType: note.getChildListType() ?? 'bullet', indent: childIndent });
  }
  return lines.join('\n');
}
