import type { EditorNote, EditorNotes, NoteListType } from '#note-sdk';

/** A note's render-relevant fields, used for the child preview. */
export interface ChildCandidate {
  noteId: string;
  text: string;
  listType: NoteListType;
  checked: boolean;
}

/** A flat search candidate: a child candidate plus its path labels (ancestor
 *  chain + own text, own text last) for path-scoped query matching. */
export interface SearchCandidate extends ChildCandidate {
  pathText: string[];
}

function toChildCandidate(note: EditorNote): ChildCandidate {
  return {
    noteId: note.id(),
    text: note.text(),
    listType: note.listType(),
    checked: note.checked(),
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
    const pathText = [...ancestorLabels, note.text()];
    candidates.push({ ...toChildCandidate(note), pathText });

    const children = note.children();
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ note: children[index]!, ancestorLabels: pathText });
    }
  }

  return candidates;
}

export function collectChildCandidateMap(editorNotes: Pick<EditorNotes, 'currentDocument'>): Record<string, ChildCandidate[]> {
  const rootNotes = editorNotes.currentDocument().children();
  const childCandidateMap: Record<string, ChildCandidate[]> = {};
  const stack: EditorNote[] = rootNotes.toReversed();

  while (stack.length > 0) {
    const note = stack.pop()!;
    const children = note.children();
    childCandidateMap[note.id()] = children.map((child) => toChildCandidate(child));

    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index]!);
    }
  }

  return childCandidateMap;
}

