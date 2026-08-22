export type NoteMenuShortcutEvent = Pick<
  KeyboardEvent,
  'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'preventDefault' | 'stopPropagation'
>;

interface NoteMenuShortcutState {
  canFold: boolean;
}

interface NoteMenuShortcutActions {
  foldViewToLevel: (level: number) => void;
  toggleFold: () => void;
  zoom: () => void;
}

export const handleNoteMenuShortcut = (
  event: NoteMenuShortcutEvent,
  current: NoteMenuShortcutState | null,
  actions: NoteMenuShortcutActions
): boolean => {
  if (!current) {
    return false;
  }
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return false;
  }
  const key = event.key.toLowerCase();
  if (key >= '0' && key <= '9') {
    event.preventDefault();
    event.stopPropagation();
    actions.foldViewToLevel(Number(key));
    return true;
  }
  if (key === 'f' && current.canFold) {
    event.preventDefault();
    event.stopPropagation();
    actions.toggleFold();
    return true;
  }
  if (key === 'z') {
    event.preventDefault();
    event.stopPropagation();
    actions.zoom();
    return true;
  }
  return false;
};
