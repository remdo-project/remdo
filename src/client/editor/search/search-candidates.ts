import type { EditorNote, EditorNotes, NoteListType } from '#note-sdk';

export interface SearchCandidate {
  noteId: string;
  text: string;
  listType: NoteListType;
  checked: boolean;
}

function toCandidate(note: EditorNote): SearchCandidate {
  return {
    noteId: note.id(),
    text: note.text(),
    listType: note.listType(),
    checked: note.checked(),
  };
}

export const ROOT_SEARCH_SCOPE_ID = '__document_root__';

export function collectSearchCandidates(editorNotes: Pick<EditorNotes, 'currentDocument'>): SearchCandidate[] {
  const candidates: SearchCandidate[] = [];
  const stack = editorNotes.currentDocument().children().toReversed();

  while (stack.length > 0) {
    const note = stack.pop()!;
    candidates.push(toCandidate(note));

    const children = note.children();
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index]!);
    }
  }

  return candidates;
}

export function collectChildCandidateMap(editorNotes: Pick<EditorNotes, 'currentDocument'>): Record<string, SearchCandidate[]> {
  const rootNotes = editorNotes.currentDocument().children();
  const childCandidateMap: Record<string, SearchCandidate[]> = {
    [ROOT_SEARCH_SCOPE_ID]: rootNotes.map((note) => toCandidate(note)),
  };
  const stack = rootNotes.toReversed();

  while (stack.length > 0) {
    const note = stack.pop()!;
    const children = note.children();
    childCandidateMap[note.id()] = children.map((child) => toCandidate(child));

    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index]!);
    }
  }

  return childCandidateMap;
}

