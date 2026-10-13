import { Button } from 'react-aria-components';
import { IconBold, IconCode, IconItalic, IconUnderline } from '@tabler/icons-react';
import { ActionTooltip } from '#client/ui/ActionTooltip';
import { INLINE_FORMATS } from './selection';
import type { FormatStates, InlineFormat } from './selection';

const META = {
  bold: { label: 'Bold', key: 'B', Icon: IconBold },
  italic: { label: 'Italic', key: 'I', Icon: IconItalic },
  underline: { label: 'Underline', key: 'U', Icon: IconUnderline },
  code: { label: 'Inline code', key: 'E', Icon: IconCode },
} as const;

export function InlineFormatButtons({ states, mac, className, onFormatStart, onFormat }: {
  states: FormatStates | null;
  mac: boolean;
  className: string;
  onFormatStart: () => void;
  onFormat: (format: InlineFormat) => void;
}) {
  return INLINE_FORMATS.map(format => {
    const { label, key, Icon } = META[format];
    const shortcut = `${mac ? '⌘' : 'Ctrl'}+${key}`;
    // React Aria Button filters aria-keyshortcuts out of its DOM props.
    return (
      <ActionTooltip key={format} label={`${label} (${shortcut})`}>
        <Button
          ref={button => { button?.setAttribute('aria-keyshortcuts', `${mac ? 'Meta' : 'Control'}+${key}`); }}
          className={className}
          aria-label={label}
          aria-pressed={states?.[format] === 'some' ? 'mixed' : states?.[format] === 'all'}
          isDisabled={states === null}
          preventFocusOnPress
          onPressStart={onFormatStart}
          onPress={() => onFormat(format)}
        >
          <span>
            <Icon size={18} aria-hidden="true" />
          </span>
        </Button>
      </ActionTooltip>
    );
  });
}
