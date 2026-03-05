import type { EditorNote, NoteSdk } from '@/editor/outline/sdk/contracts';

export interface SdkSearchCandidate {
  noteId: string;
  text: string;
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
