import type { RefObject } from 'react';
import { Toolbar } from 'react-aria-components';
import type { FormatStates, InlineFormat } from './selection';
import { InlineFormatButtons } from './InlineFormatButtons';

interface InlineSelectionToolbarProps {
  toolbarRef: RefObject<HTMLDivElement | null>;
  states: FormatStates;
  mac: boolean;
  onFormatStart: () => void;
  onFormat: (format: InlineFormat) => void;
}

export function InlineSelectionToolbar({ toolbarRef, states, mac, onFormatStart, onFormat }: InlineSelectionToolbarProps) {
  return (
    <Toolbar
      ref={toolbarRef}
      aria-label="Text formatting"
      className="inline-selection-toolbar"
      onMouseDownCapture={event => event.preventDefault()}
    >
      <InlineFormatButtons
        className="inline-selection-toolbar__button"
        states={states}
        mac={mac}
        onFormatStart={onFormatStart}
        onFormat={onFormat}
      />
    </Toolbar>
  );
}
