import type { RefObject } from 'react';
import { Button, Toolbar } from 'react-aria-components';
import { IconBold, IconCode, IconItalic, IconUnderline } from '@tabler/icons-react';
import { INLINE_FORMATS } from './selection';
import type { FormatStates, InlineFormat } from './selection';

const META = {
  bold: { label: 'Bold', key: 'B', Icon: IconBold },
  italic: { label: 'Italic', key: 'I', Icon: IconItalic },
  underline: { label: 'Underline', key: 'U', Icon: IconUnderline },
  code: { label: 'Inline code', key: 'E', Icon: IconCode },
} as const;

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
      {INLINE_FORMATS.map(format => {
        const { label, key, Icon } = META[format];
        const shortcut = `${mac ? '⌘' : 'Ctrl'}+${key}`;
        // React Aria Button's DOM prop filter omits aria-keyshortcuts.
        return (
          <Button
            key={format}
            ref={button => { button?.setAttribute('aria-keyshortcuts', `${mac ? 'Meta' : 'Control'}+${key}`); }}
            className="inline-selection-toolbar__button"
            aria-label={label}
            aria-pressed={states[format] === 'some' ? 'mixed' : states[format] === 'all'}
            preventFocusOnPress
            onPressStart={onFormatStart}
            onPress={() => onFormat(format)}
          >
            <span title={`${label} (${shortcut})`}>
              <Icon size={18} aria-hidden="true" />
            </span>
          </Button>
        );
      })}
    </Toolbar>
  );
}
