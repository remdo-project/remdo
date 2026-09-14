export type NoteMenuShortcutEvent = Pick<
  KeyboardEvent,
  'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'preventDefault' | 'stopPropagation'
>;

interface NoteMenuShortcutActions {
  dismiss?: () => void;
  foldViewToLevel?: (level: number) => void;
  toggleFold?: () => void;
  zoom?: () => void;
  zoomOut?: () => void;
}

export const handleNoteMenuShortcut = (
  event: NoteMenuShortcutEvent,
  actions: NoteMenuShortcutActions
): boolean => {
  if ((event.key === 'Tab' || event.key === 'Escape') && actions.dismiss) {
    event.preventDefault();
    event.stopPropagation();
    actions.dismiss();
    return true;
  }
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return false;
  }
  const key = event.key.toLowerCase();
  if (key === 'o' && actions.zoomOut) {
    event.preventDefault();
    event.stopPropagation();
    actions.zoomOut();
    return true;
  }
  if (key >= '0' && key <= '9' && actions.foldViewToLevel) {
    event.preventDefault();
    event.stopPropagation();
    actions.foldViewToLevel(Number(key));
    return true;
  }
  if (key === 'f' && actions.toggleFold) {
    event.preventDefault();
    event.stopPropagation();
    actions.toggleFold();
    return true;
  }
  if (key === 'z' && actions.zoom) {
    event.preventDefault();
    event.stopPropagation();
    actions.zoom();
    return true;
  }
  return false;
};
