import type { EditorNote, NoteSdk } from '@/editor/outline/sdk/contracts';

export interface SdkSearchCandidate {
  noteId: string;
  text: string;
}

export interface SdkSearchCandidateSnapshot {
  allCandidates: SdkSearchCandidate[];
  topLevelCandidates: SdkSearchCandidate[];
  childCandidateMap: Record<string, SdkSearchCandidate[]>;
}

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

export function collectTopLevelSearchCandidatesFromSdk(sdk: Pick<NoteSdk, 'currentDocument'>): SdkSearchCandidate[] {
  return sdk.currentDocument().children().map((note) => ({
    noteId: note.id(),
    text: note.text(),
  }));
}

export function collectChildCandidateMapFromSdk(sdk: Pick<NoteSdk, 'currentDocument'>): Record<string, SdkSearchCandidate[]> {
  const childCandidateMap: Record<string, SdkSearchCandidate[]> = {};

  const visit = (note: EditorNote): void => {
    childCandidateMap[note.id()] = note.children().map((child) => ({
      noteId: child.id(),
      text: child.text(),
    }));

    for (const child of note.children()) {
      visit(child);
    }
  };

  for (const rootNote of sdk.currentDocument().children()) {
    visit(rootNote);
  }

  return childCandidateMap;
}
