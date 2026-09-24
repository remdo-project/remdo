import { useRef } from 'react';
import { Button, Header, Menu, MenuItem, MenuSection, MenuTrigger, Popover } from 'react-aria-components';
import type { DocumentNote } from '#note-sdk';

export function DocumentMenu({
  label,
  note,
  onDelete,
  onRename,
  onShare,
}: {
  label: string;
  note: DocumentNote;
  onDelete: (note: DocumentNote, trigger: HTMLButtonElement | null) => void;
  onRename: (note: DocumentNote, trigger: HTMLButtonElement | null) => void;
  onShare: (note: DocumentNote, trigger: HTMLButtonElement | null) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const canRename = note.canRename();
  const canShare = note.canShareWith();
  const canDelete = note.canDelete();
  if (!canRename && !canShare && !canDelete) return null;
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
            {canDelete && (
              <MenuItem onAction={() => onDelete(note, triggerRef.current)}>
                Delete…
              </MenuItem>
            )}
          </MenuSection>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
