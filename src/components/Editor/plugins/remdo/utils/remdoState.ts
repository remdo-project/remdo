import { $getNodeByKey, type LexicalEditor } from "lexical";

export const REMDO_FILTER_TAG = "remdo:filter";
export const REMDO_FOCUS_TAG = "remdo:focus";

class RemdoState {
  private _filter = "";
  private _focusKey: string | undefined;

  getFilter(): string {
    return this._filter;
  }

  setFilter(filter: string): void {
    this._filter = filter;
  }

  getFocus() {
    return this._focusKey ? $getNodeByKey(this._focusKey) : undefined;
  }

  setFocusKey(key: string): void {
    this._focusKey = key === "root" ? undefined : key;
  }
}

const remdoStateMap = new WeakMap<LexicalEditor, RemdoState>();

export function ensureRemdoState(editor: LexicalEditor): RemdoState {
  let state = remdoStateMap.get(editor);
  if (!state) {
    state = new RemdoState();
    remdoStateMap.set(editor, state);
  }
  return state;
}

export function getRemdoState(editor: LexicalEditor): RemdoState | undefined {
  return remdoStateMap.get(editor);
}

export function setRemdoFilter(editor: LexicalEditor, filter: string): void {
  ensureRemdoState(editor).setFilter(filter);
}

export function setRemdoFocusKey(editor: LexicalEditor, key: string): void {
  ensureRemdoState(editor).setFocusKey(key);
}

export function clearRemdoState(editor: LexicalEditor): void {
  remdoStateMap.delete(editor);
}
