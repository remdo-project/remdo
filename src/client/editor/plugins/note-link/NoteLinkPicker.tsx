import type { MouseEvent as ReactMouseEvent } from 'react';

import type { TriggerPickerState, TriggerPopupHandlers } from '#client/editor/triggers/types';
import type { LinkPickerOption } from '#client/editor/links/note-link-index';
import { getOptionId } from './option-id';

interface NoteLinkPickerProps {
  picker: TriggerPickerState<LinkPickerOption>;
  handlers: TriggerPopupHandlers<LinkPickerOption>;
}

// The note-link popup body. The shared trigger engine owns the portal and the
// positioned, dismissable anchor wrapper; this renders only the listbox.
export function NoteLinkPicker({ picker, handlers }: NoteLinkPickerProps) {
  return (
    <div
      className="note-link-picker"
      data-note-link-picker
      id={handlers.listboxId}
      role="listbox"
      aria-label="Link notes"
      onMouseDown={handlers.onPickerMouseDown}
    >
      {picker.options.length === 0
        ? (
            <div className="note-link-picker__empty" data-note-link-picker-empty="true">
              No results...
            </div>
          )
        : picker.options.map((option, index) => (
            <div
              key={option.noteId}
              className={`note-link-picker__item${index === picker.activeIndex ? ' note-link-picker__item--active' : ''}`}
              data-note-link-picker-item="true"
              data-note-link-picker-item-active={index === picker.activeIndex ? 'true' : undefined}
              role="option"
              id={getOptionId(index, option.noteId)}
              aria-selected={index === picker.activeIndex}
              onMouseOver={() => {
                handlers.onItemMouseOver(index);
              }}
              onMouseDown={(event: ReactMouseEvent<HTMLDivElement>) => {
                handlers.onItemMouseDown(index, event);
              }}
            >
              <span className="note-link-picker__title">{option.title.length > 0 ? option.title : '(empty)'}</span>
              {option.context
                ? <span className="note-link-picker__context">{option.context}</span>
                : null}
            </div>
          ))}
    </div>
  );
}
