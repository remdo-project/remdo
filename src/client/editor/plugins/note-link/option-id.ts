import type { TriggerPickerState } from '#client/editor/triggers/types';
import type { LinkPickerOption } from '#client/editor/links/note-link-index';

function toDomIdFragment(value: string): string {
  return value.replaceAll(/[^\w-]/g, '-');
}

// The stable DOM id for a link-picker option row.
export function getOptionId(index: number, noteId: string): string {
  return `note-link-picker-option-${index}-${toDomIdFragment(noteId)}`;
}

// The DOM id of the highlighted option, mirrored onto the editor host's
// aria-activedescendant by the trigger engine (the combobox role lives on the
// focused host, not the listbox).
export function getActiveOptionId(picker: TriggerPickerState<LinkPickerOption>): string | undefined {
  const activeOption = picker.options[picker.activeIndex];
  return activeOption ? getOptionId(picker.activeIndex, activeOption.noteId) : undefined;
}
