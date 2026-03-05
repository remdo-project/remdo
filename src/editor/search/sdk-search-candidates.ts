import type { EditorNote, NoteSdk } from '@/editor/outline/sdk/contracts';

export interface SdkSearchCandidate {
  noteId: string;
  text: string;
}

export interface SdkSearchCandidateSnapshot {
  allCandidates: SdkSearchCandidate[];
  childCandidateMap: Record<string, SdkSearchCandidate[]>;
}

export const ROOT_SEARCH_SCOPE_ID = '__document_root__';

function appendCandidates(note: EditorNote, candidates: SdkSearchCandidate[]): void {
  candidates.push({
    noteId: note.id(),
    text: note.text(),
  });

  for (const child of note.children()) {
    appendCandidates(child, candidates);
  }
}

export function collectSearchCandidatesFromSdk(sdk: Pick<NoteSdk, 'currentDocument'>): SdkSearchCandidate[] {
  const candidates: SdkSearchCandidate[] = [];
  for (const rootNote of sdk.currentDocument().children()) {
    appendCandidates(rootNote, candidates);
  }
  return candidates;
}

export function collectChildCandidateMapFromSdk(sdk: Pick<NoteSdk, 'currentDocument'>): Record<string, SdkSearchCandidate[]> {
  const rootNotes = sdk.currentDocument().children();
  const childCandidateMap: Record<string, SdkSearchCandidate[]> = {
    [ROOT_SEARCH_SCOPE_ID]: rootNotes.map((note) => ({
      noteId: note.id(),
      text: note.text(),
    })),
  };

  const visit = (note: EditorNote): void => {
    childCandidateMap[note.id()] = note.children().map((child) => ({
      noteId: child.id(),
      text: child.text(),
    }));

    for (const child of note.children()) {
      visit(child);
    }
  };

  for (const rootNote of rootNotes) {
    visit(rootNote);
  }

  return childCandidateMap;
}
