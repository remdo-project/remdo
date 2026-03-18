import type { NoteSdk } from '@/notes/contracts';

export interface SdkSearchCandidate {
  noteId: string;
  text: string;
}

export interface SdkSearchCandidateSnapshot {
  allCandidates: SdkSearchCandidate[];
  childCandidateMap: Record<string, SdkSearchCandidate[]>;
}

export const ROOT_SEARCH_SCOPE_ID = '__document_root__';

export function collectSearchCandidatesFromSdk(sdk: Pick<NoteSdk, 'currentDocument'>): SdkSearchCandidate[] {
  const candidates: SdkSearchCandidate[] = [];
  const stack = sdk.currentDocument().children().toReversed();

  while (stack.length > 0) {
    const note = stack.pop()!;
    candidates.push({
      noteId: note.id(),
      text: note.text(),
    });

    const children = note.children();
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index]!);
    }
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
  const stack = rootNotes.toReversed();

  while (stack.length > 0) {
    const note = stack.pop()!;
    const children = note.children();
    childCandidateMap[note.id()] = children.map((child) => ({
      noteId: child.id(),
      text: child.text(),
    }));

    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index]!);
    }
  }

  return childCandidateMap;
}
