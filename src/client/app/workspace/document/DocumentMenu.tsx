import { useRef } from 'react';
import { Button, Header, Menu, MenuItem, MenuSection, MenuTrigger, Popover } from 'react-aria-components';
import type { DocumentNote } from '#note-sdk';

export function DocumentMenu({
  label,
  note,
  onRename,
  onShare,
}: {
  label: string;
  note: DocumentNote;
  onRename: (note: DocumentNote, trigger: HTMLButtonElement | null) => void;
  onShare: (note: DocumentNote, trigger: HTMLButtonElement | null) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const canRename = note.canRename();
  const canShare = note.canShareWith();
  if (!canRename && !canShare) return null;
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
            {canRename && (
              <MenuItem onAction={() => onRename(note, triggerRef.current)}>
                Rename…
              </MenuItem>
            )}
            {canShare && (
              <MenuItem onAction={() => onShare(note, triggerRef.current)}>
                Share…
              </MenuItem>
            )}
          </MenuSection>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
