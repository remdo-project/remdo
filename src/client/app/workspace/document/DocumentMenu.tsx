import { useRef } from 'react';
import { Button, Header, Menu, MenuItem, MenuSection, MenuTrigger, Popover } from 'react-aria-components';
import type { DocumentNote } from '#note-sdk';

export function DocumentMenu({
  note,
  onRename,
}: {
  note: DocumentNote;
  onRename: (note: DocumentNote, trigger: HTMLButtonElement | null) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  if (!note.canRename()) return null;
  return (
    <MenuTrigger>
      <Button
        aria-label={`Actions for ${note.getText()}`}
        className="remdo-menu-button document-menu-button"
        data-document-menu-ref={note.getId()}
        ref={triggerRef}
      />
      <Popover offset={4} placement="bottom start">
        <Menu aria-label="Document actions" className="remdo-menu">
          <MenuSection>
            <Header>Note</Header>
            <MenuItem data-document-menu-item="rename" onAction={() => onRename(note, triggerRef.current)}>
              Rename…
            </MenuItem>
          </MenuSection>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
