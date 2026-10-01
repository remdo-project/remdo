import { Kbd, VisuallyHidden } from '@mantine/core';
import { IconKeyboard } from '@tabler/icons-react';
import { IS_APPLE } from 'lexical';
import { useId, useState } from 'react';
import { Button, Dialog, Heading } from 'react-aria-components';
import { useCoarsePointer } from '#client/browser/useCoarsePointer';
import { Icon } from '#client/ui/Icon';
import { referenceGroups } from './keyboard-reference-entries';
import './KeyboardReference.css';

const KEY_NAMES: Record<string, string> = {
  '⌘': 'Command',
  '↑/↓': 'Up or Down arrow',
  '←/→': 'Left or Right arrow',
  '1–9': '1 to 9',
};

function KeyCap({ label }: { label: string }) {
  const name = KEY_NAMES[label];
  return name
    ? <Kbd><span aria-hidden="true">{label}</span><VisuallyHidden>{name}</VisuallyHidden></Kbd>
    : <Kbd>{label}</Kbd>;
}

function ReferenceGroups() {
  return referenceGroups(IS_APPLE ? 'mac' : 'other').map((group) => (
    <div className="keyboard-reference-group" key={group.title}>
      <h3 className="keyboard-reference-group-title">{group.title}</h3>
      {group.note && <p className="keyboard-reference-group-note">{group.note}</p>}
      <dl className="keyboard-reference-entries">
        {group.entries.map((entry) => (
          <div className="keyboard-reference-entry" key={entry.action}>
            <dt>{entry.action}</dt>
            <dd>
              {entry.keys.map((label, position) => (
                // eslint-disable-next-line react/no-array-index-key -- a chord may repeat a key (Shift Shift)
                <KeyCap key={position} label={label} />
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  ));
}

function KeyboardReferencePanel({ id, onClose }: { id: string; onClose: () => void }) {
  return (
    <div
      className="keyboard-reference-panel"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <Dialog className="keyboard-reference-dialog" id={id}>
        <div className="keyboard-reference-header">
          <Heading className="keyboard-reference-title" slot="title">Keyboard reference</Heading>
          <Button aria-label="Close" className="remdo-dialog-close" onPress={onClose}>{'×'}</Button>
        </div>
        <div className="keyboard-reference-list">
          <ReferenceGroups />
        </div>
      </Dialog>
    </div>
  );
}

function KeyboardReferenceControl({ onClose }: { onClose: () => void }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
    onClose();
  };

  return (
    <div className="keyboard-reference">
      {open && <KeyboardReferencePanel id={panelId} onClose={close} />}
      <Button
        aria-controls={open ? panelId : undefined}
        aria-expanded={open}
        aria-label="Keyboard reference"
        className="keyboard-reference-toggle"
        onPress={() => {
          if (open) close();
          else setOpen(true);
        }}
      >
        <Icon icon={IconKeyboard} size={20} />
      </Button>
    </div>
  );
}

/** `onClose` returns DOM focus to the editor whenever the reference closes. */
export function KeyboardReference({ onClose }: { onClose: () => void }) {
  const isCoarsePointer = useCoarsePointer();
  return isCoarsePointer ? null : <KeyboardReferenceControl onClose={onClose} />;
}
