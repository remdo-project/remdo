import { $isListNode, ListItemNode } from '@lexical/list';
import { $getState, createState } from 'lexical';
import type { NoteMarkerView } from '#note-sdk';
import { isWrapperItem } from '#client/editor/outline/list-structure';
import { noteMarkerAttributes } from '#client/editor/outline/note-marker-attributes';
import { patchListItemStateConfig } from '#client/editor/runtime/list-item-state-config';
import { $getNoteChecked } from './checked-state';

export const markerState = createState('marker', {
  parse: (value) =>
    typeof value === 'string' && /^(?:bullet|block|number(?::(?:0|[1-9]\d{0,8}))?|heading:[1-6])$/.test(value)
      ? value
      : undefined,
});

export const checkboxState = createState('checkbox', {
  parse: (value) => (value === true ? true : undefined),
});

export const verbatimState = createState('verbatim', {
  parse: (value) => (value === true ? true : undefined),
});

let didPatch = false;

export function ensureNoteMarkerStateConfig(): void {
  if (didPatch) {
    return;
  }
  didPatch = true;
  patchListItemStateConfig(markerState);
  patchListItemStateConfig(checkboxState);
  patchListItemStateConfig(verbatimState);
  patchListItemMarkerDOM();
}

// Lexical rewrites a list item's checkbox semantics whenever it renders the item, keeping them only
// in check lists, so a note's own marker attributes are written in that same step. Its number
// depends on its siblings and is written by NoteMarkerPlugin.
function patchListItemMarkerDOM(): void {
  // Copied HTML keeps checkbox semantics only in check lists: importers read any list holding a
  // checkbox item as a check list.
  const originalExportDOM = ListItemNode.prototype.exportDOM;
  ListItemNode.prototype.exportDOM = function $exportDOM(this: ListItemNode, ...args: Parameters<ListItemNode['exportDOM']>) {
    const output = originalExportDOM.apply(this, args);
    const list = this.getParent();
    if (output.element instanceof HTMLElement && !($isListNode(list) && list.getListType() === 'check')) {
      setAttributes(output.element, { role: undefined, tabIndex: undefined, 'aria-checked': undefined });
    }
    return output;
  };

  const original = ListItemNode.prototype.updateListItemDOM;
  ListItemNode.prototype.updateListItemDOM = function $updateListItemDOM(
    this: ListItemNode,
    ...args: Parameters<ListItemNode['updateListItemDOM']>
  ) {
    original.apply(this, args);
    if (isWrapperItem(this)) {
      return;
    }
    const [view] = $noteMarkerViews([this]);
    const { 'data-number': _number, ...attributes } = noteMarkerAttributes(view!);
    const dom = args[1];
    setAttributes(dom, attributes);
    const list = this.getParent();
    if (view!.checkbox && !($isListNode(list) && list.getListType() === 'check')) {
      setAttributes(dom, {
        role: 'checkbox',
        tabIndex: '-1',
        'aria-checked': $getNoteChecked(this) === true ? 'true' : 'false',
      });
    }
  };
}

export function setAttributes(element: HTMLElement, attributes: Record<string, string | undefined>): void {
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined) {
      element.removeAttribute(name);
    } else if (element.getAttribute(name) !== value) {
      element.setAttribute(name, value);
    }
  }
}

// Editor documents keep a list's type on the list until they move to the text format, so a note
// without a marker of its own follows its list.
export function $getNoteMarker(note: ListItemNode): string {
  const stored = $getState(note, markerState);
  if (stored !== undefined) {
    return stored;
  }
  const list = note.getParent();
  return $isListNode(list) && list.getListType() === 'number' ? 'number' : 'bullet';
}

export function $hasNoteCheckbox(note: ListItemNode): boolean {
  if ($getState(note, checkboxState) === true || $getNoteChecked(note) === true) {
    return true;
  }
  const list = note.getParent();
  return $isListNode(list) && list.getListType() === 'check';
}

/** How consecutive sibling notes' markers show, numbering each from its start or the note before it. */
export function $noteMarkerViews(siblings: readonly ListItemNode[]): NoteMarkerView[] {
  let previous: number | null = null;
  return siblings.map((note) => {
    const [kind, detail] = $getNoteMarker(note).split(':') as [NoteMarkerView['kind'], string | undefined];
    const number = kind === 'number' ? (detail === undefined ? (previous ?? 0) + 1 : Number(detail)) : null;
    previous = number;
    return {
      kind,
      number,
      headingLevel: kind === 'heading' ? Number(detail) : null,
      checkbox: $hasNoteCheckbox(note),
    };
  });
}
