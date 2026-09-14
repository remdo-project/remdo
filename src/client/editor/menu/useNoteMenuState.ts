import { useMemo, useSyncExternalStore } from 'react';
import { NoteUnavailableError } from '#note-sdk';
import type { NoteListType, OpenDocumentNote } from '#note-sdk';

interface NoteMenuState {
  folded: boolean;
  childListType: NoteListType | null;
  canToggleFold: boolean;
  canSetChildListType: boolean;
}

/** Keep React's cached snapshot protocol local to the menu's observation binding. */
export function useNoteMenuState(note: OpenDocumentNote): NoteMenuState | null {
  const getSnapshot = useMemo(() => {
    let current: NoteMenuState | null = null;
    return () => {
      try {
        const next = {
          folded: note.getFolded(),
          childListType: note.getChildListType(),
          canToggleFold: note.canToggleFold(),
          canSetChildListType: note.canSetChildListType(),
        };
        if (!current || current.folded !== next.folded || current.childListType !== next.childListType
          || current.canToggleFold !== next.canToggleFold || current.canSetChildListType !== next.canSetChildListType) {
          current = next;
        }
        return current;
      } catch (error) {
        if (!(error instanceof NoteUnavailableError)) throw error;
        current = null;
        return current;
      }
    };
  }, [note]);
  return useSyncExternalStore(note.subscribe, getSnapshot, getSnapshot);
}
