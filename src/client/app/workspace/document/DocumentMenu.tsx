import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Button, Header, Menu, MenuItem, MenuSection, MenuTrigger, Popover } from 'react-aria-components';
import type { DocumentNote, OpenDocument } from '#note-sdk';

export function DocumentMenu({
  label,
  note,
  onDelete,
  onRename,
  onShare,
  view,
}: {
  label: string;
  note: DocumentNote;
  onDelete: (note: DocumentNote, trigger: HTMLButtonElement | null) => void;
  onRename: (note: DocumentNote, trigger: HTMLButtonElement | null) => void;
  onShare: (note: DocumentNote, trigger: HTMLButtonElement | null) => void;
  view?: OpenDocument['view'];
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const canRename = note.canRename();
  const canShare = note.canShareWith();
  const canDelete = note.canDelete();
  const hasDocumentActions = canRename || canShare || canDelete;
  if (!hasDocumentActions && !view) return null;

  const handleViewShortcut = (event: KeyboardEvent<HTMLElement>) => {
    if (!view || event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key.toLowerCase();
    const isFoldLevel = key >= '0' && key <= '9';
    if (key !== 'o' && !isFoldLevel) return;
    event.preventDefault();
    event.stopPropagation();
    setIsOpen(false);
    if (isFoldLevel) view.foldToLevel(Number(key));
    else view.zoomOut();
  };

  return (
    <MenuTrigger isOpen={isOpen} onOpenChange={setIsOpen}>
      <Button
        aria-label={`Actions for ${label}`}
        className="document-menu-button"
        ref={triggerRef}
      />
      <Popover offset={4} placement="bottom start">
        <div onKeyDownCapture={handleViewShortcut}>
          <Menu aria-label="Document actions" className="remdo-menu">
            {hasDocumentActions && (
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
            )}
            {view && (
              <MenuSection>
                <Header>View</Header>
                <MenuItem onAction={view.zoomOut}>
                  Zoom <span className="note-menu-shortcut">o</span>ut
                </MenuItem>
                <MenuItem onAction={() => { view.foldToLevel(1); }}>
                  Fold to level [<span className="note-menu-shortcut">0-9</span>]
                </MenuItem>
              </MenuSection>
            )}
          </Menu>
        </div>
      </Popover>
    </MenuTrigger>
  );
}
