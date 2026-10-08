import type { LexicalEditor } from 'lexical';

// The single-open rule for editor popups (docs/specs/outliner/popups.md): at most one
// transient editor popup — a trigger picker (`@`, `!`) or the quick action menu —
// is open at a time. Each popup instance holds a unique token and registers itself
// while open; another instance consults this registry to refuse to open on top of
// one already open. Keyed by editor so separate editors never block each other.
const activePopupsByEditor = new WeakMap<LexicalEditor, Set<symbol>>();
const listenersByEditor = new WeakMap<LexicalEditor, Set<() => void>>();

export function setPopupActive(editor: LexicalEditor, token: symbol, active: boolean): void {
  let tokens = activePopupsByEditor.get(editor);
  if (!tokens) {
    tokens = new Set();
    activePopupsByEditor.set(editor, tokens);
  }
  if (active) {
    tokens.add(token);
  } else {
    tokens.delete(token);
  }
  for (const listener of listenersByEditor.get(editor) ?? []) listener();
}

export function subscribeToActivePopup(editor: LexicalEditor, listener: () => void): () => void {
  let listeners = listenersByEditor.get(editor);
  if (!listeners) {
    listeners = new Set();
    listenersByEditor.set(editor, listeners);
  }
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// Whether any editor popup other than `token` is open in this editor.
export function isOtherPopupActive(editor: LexicalEditor, token: symbol): boolean {
  const tokens = activePopupsByEditor.get(editor);
  if (!tokens) {
    return false;
  }
  for (const active of tokens) {
    if (active !== token) {
      return true;
    }
  }
  return false;
}

// Whether any editor popup is open in this editor. Used by features that must
// stand down while a popup owns the keyboard (e.g. body arrow navigation).
export function isAnyPopupActive(editor: LexicalEditor): boolean {
  const tokens = activePopupsByEditor.get(editor);
  return tokens !== undefined && tokens.size > 0;
}
