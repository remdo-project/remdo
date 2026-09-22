import { useRef } from 'react';
import { Button, Header, Menu, MenuItem, MenuSection, MenuTrigger, Popover } from 'react-aria-components';
import type { DocumentNote } from '#note-sdk';

export function DocumentMenu({
  label,
  note,
  onRename,
}: {
  label: string;
  note: DocumentNote;
  onRename: (note: DocumentNote, trigger: HTMLButtonElement | null) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  if (!note.canRename()) return null;
  return (
    <MenuTrigger>
      <Button
        aria-label={`Actions for ${label}`}
        className="document-menu-button"
        ref={triggerRef}
      />
      <Popover offset={4} placement="bottom start">
        <Menu aria-label="Document actions" className="remdo-menu">
          <MenuSection>
            <Header>Note</Header>
            <MenuItem onAction={() => onRename(note, triggerRef.current)}>
              Rename…
            </MenuItem>
          </MenuSection>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
