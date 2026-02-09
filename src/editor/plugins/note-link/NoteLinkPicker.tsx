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

  return createPortal(
    <div className="note-link-picker-anchor" style={anchorStyle} data-note-link-picker>
      <div className="note-link-picker" role="listbox" aria-label="Link notes" onMouseDown={onPickerMouseDown}>
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
