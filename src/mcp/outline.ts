import type { NoteId, NoteListType, OpenDocumentParentNote } from '#note-sdk';

const escapeLabel = (text: string) => text.replaceAll(/[\\[\]]/g, String.raw`\$&`);

/** Renders the notes under `root` as a nested Markdown list whose labels link to each note. */
export function renderOutline(root: OpenDocumentParentNote, noteUrl: (noteId: NoteId) => string): string {
  const lines: string[] = [];
  const visit = (parent: OpenDocumentParentNote, listType: NoteListType, indent: string) => {
    for (const note of parent.getChildren()) {
      const marker = listType === 'number' ? '1.' : '-';
      // eslint-disable-next-line no-restricted-syntax -- SDK note read, not Lexical's list item state.
      const checkbox = note.getChecked() ? ' [x]' : listType === 'check' ? ' [ ]' : '';
      lines.push(`${indent}${marker}${checkbox} [${escapeLabel(note.getText())}](${noteUrl(note.getId())})`);
      const childIndent = `${indent}${' '.repeat(marker.length + 1)}`;
      for (const line of note.getBody()?.split('\n') ?? []) lines.push(`${childIndent}>${line ? ` ${line}` : ''}`);
      visit(note, note.getChildListType() ?? 'bullet', childIndent);
    }
  };
  visit(root, 'bullet', '');
  return lines.join('\n');
}
