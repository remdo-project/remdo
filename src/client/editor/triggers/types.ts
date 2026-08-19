import type { ReactNode } from 'react';
import type { RangeSelection, TextNode } from 'lexical';

// Shared by every inline trigger picker. See docs/specs/outliner/popups.md.

// Where a live trigger session is rooted: the text node holding the trigger
// character and its offset within that node.
export interface TriggerSession {
  textNodeKey: string;
  triggerOffset: number;
}

// The resolved state of an open picker, handed to a spec's popup renderer.
export interface TriggerPickerState<TOption> {
  query: string;
  options: TOption[];
  activeIndex: number;
}

// Handlers a popup renderer wires onto its rows and container.
export interface TriggerPopupHandlers<TOption> {
  onPickerMouseDown: (event: React.MouseEvent<HTMLElement>) => void;
  onItemMouseOver: (index: number) => void;
  onItemMouseDown: (index: number, event: React.MouseEvent<HTMLElement>) => void;
  // Commit an explicit option (for popups that pick a value directly, like a
  // calendar day, rather than from the resolved option list).
  commitOption: (option: TOption) => void;
  // Cancel the picker and return focus to the editor. Used when the popup holds
  // DOM focus (the calendar), so Lexical key commands do not fire.
  cancel: () => void;
  // The DOM id a combobox popup must put on its listbox element, so the engine
  // can point the editor host's `aria-controls` at it (WAI-ARIA combobox: the
  // role lives on the focused host, not the popup). Omit when the popup manages
  // its own focus and AT state.
  listboxId?: string;
}

// The range covering the trigger character through the caret — the span a
// commit replaces — plus the caret's (text) node and the resolved query.
interface TriggerCommitTarget {
  range: RangeSelection;
  anchorNode: TextNode;
  query: string;
}

// Everything that differs between one trigger picker and another. The shared
// engine (useTriggerSession) owns the lifecycle; a spec owns only these.
export interface TriggerSpec<TOption> {
  // The single character that opens this picker (e.g. '@', '!').
  triggerChar: string;
  // For a combobox that keeps focus in the editor: the DOM id of the currently
  // highlighted option, which the engine mirrors onto the editor host's
  // `aria-activedescendant`. Must match the `id` the popup renders on that
  // option. Omit when the popup manages its own focus and AT state.
  getActiveDescendantId?: (state: TriggerPickerState<TOption>) => string | undefined;
  // Resolve the option list for the current query. Runs inside an editor read.
  $resolveOptions: (query: string, anchorNode: TextNode) => TOption[];
  // Insert this trigger's committed content over `range`, replacing the
  // trigger-and-query span. Runs inside an editor update. A trailing space is
  // the spec's responsibility (it varies per node type).
  $commit: (option: TOption, target: TriggerCommitTarget) => void;
  // Render the popup for the resolved state.
  renderPopup: (state: TriggerPickerState<TOption>, handlers: TriggerPopupHandlers<TOption>) => ReactNode;
}
