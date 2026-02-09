import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';

import type { LinkPickerState } from './types';

interface NoteLinkPickerProps {
  picker: LinkPickerState;
  portalRoot: HTMLElement;
  onPickerMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onItemMouseOver: (index: number) => void;
  onItemMouseDown: (index: number, event: ReactMouseEvent<HTMLDivElement>) => void;
}

function toDomIdFragment(value: string): string {
  return value.replaceAll(/[^\w-]/g, '-');
}

function getOptionId(index: number, noteId: string): string {
  return `note-link-picker-option-${index}-${toDomIdFragment(noteId)}`;
}

export function NoteLinkPicker({
  picker,
  portalRoot,
  onPickerMouseDown,
  onItemMouseOver,
  onItemMouseDown,
}: NoteLinkPickerProps) {
  const anchorStyle: CSSProperties = {
    left: picker.anchor.left,
    top: picker.anchor.top,
  };
  const activeOption = picker.options[picker.activeIndex];
  const activeOptionId = activeOption ? getOptionId(picker.activeIndex, activeOption.noteId) : undefined;

  return createPortal(
    <div className="note-link-picker-anchor" style={anchorStyle} data-note-link-picker>
      <div
        className="note-link-picker"
        role="listbox"
        aria-label="Link notes"
        aria-activedescendant={activeOptionId}
        onMouseDown={onPickerMouseDown}
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
                  onItemMouseOver(index);
                }}
                onMouseDown={(event) => {
                  onItemMouseDown(index, event);
                }}
              >
                <span className="note-link-picker__title">{option.title.length > 0 ? option.title : '(empty)'}</span>
                {option.context
                  ? <span className="note-link-picker__context">{option.context}</span>
                  : null}
              </div>
            ))}
      </div>
    </div>,
    portalRoot
  );
}
