import type { EditorNote, EditorNotes, NoteListType } from '#note-sdk';

export interface SearchCandidate {
  noteId: string;
  text: string;
  listType: NoteListType;
  checked: boolean;
  /** The note's path entry labels (ancestor chain + own text, own text last),
   *  used for path-scoped query matching. */
  pathText: string[];
}

function toCandidate(note: EditorNote, ancestorLabels: readonly string[]): SearchCandidate {
  const text = note.text();
  return {
    noteId: note.id(),
    text,
    listType: note.listType(),
    checked: note.checked(),
    pathText: [...ancestorLabels, text],
  };
}

interface CandidateWalkEntry {
  note: EditorNote;
  ancestorLabels: string[];
}

export function collectSearchCandidates(editorNotes: Pick<EditorNotes, 'currentDocument'>): SearchCandidate[] {
  const candidates: SearchCandidate[] = [];
  const stack: CandidateWalkEntry[] = editorNotes.currentDocument().children()
    .toReversed()
    .map((note) => ({ note, ancestorLabels: [] }));

  while (stack.length > 0) {
    const { note, ancestorLabels } = stack.pop()!;
    const candidate = toCandidate(note, ancestorLabels);
    candidates.push(candidate);

    const children = note.children();
    const childAncestorLabels = candidate.pathText;
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ note: children[index]!, ancestorLabels: childAncestorLabels });
    }
  }

  return candidates;
}

export function collectChildCandidateMap(editorNotes: Pick<EditorNotes, 'currentDocument'>): Record<string, SearchCandidate[]> {
  const rootNotes = editorNotes.currentDocument().children();
  const childCandidateMap: Record<string, SearchCandidate[]> = {};
  const stack: CandidateWalkEntry[] = rootNotes
    .toReversed()
    .map((note) => ({ note, ancestorLabels: [] }));

  while (stack.length > 0) {
    const { note, ancestorLabels } = stack.pop()!;
    const ownPath = [...ancestorLabels, note.text()];
    const children = note.children();
    childCandidateMap[note.id()] = children.map((child) => toCandidate(child, ownPath));

    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ note: children[index]!, ancestorLabels: ownPath });
    }
  }

  return childCandidateMap;
}

