import { Button as FormButton, Group, Stack, TextInput } from '@mantine/core';
import type { RefObject } from 'react';
import { useRef, useState } from 'react';
import { Button, Dialog, Heading, Header, Menu, MenuItem, MenuSection, MenuTrigger, Modal, ModalOverlay, Popover } from 'react-aria-components';
import type { DocumentNote } from '#note-sdk';
import { handleNoteMenuShortcut } from '#client/ui/note-menu-shortcuts';
import '#client/ui/note-menu.css';

interface RenameTarget {
  note: DocumentNote;
  openingName: string;
  trigger: HTMLButtonElement | null;
}

export function DocumentMenu({
  note,
  onRename,
  onFoldToLevel,
  onZoomOut,
}: {
  note: DocumentNote;
  onRename: (note: DocumentNote, trigger: HTMLButtonElement | null) => void;
  onFoldToLevel?: (level: number) => void;
  onZoomOut?: () => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <MenuTrigger isOpen={open} onOpenChange={setOpen}>
      <Button aria-label={`Actions for ${note.text()}`} className="note-menu-button" ref={triggerRef} />
      <Popover offset={8} placement="right">
        <div
          onKeyDownCapture={(event) => {
            handleNoteMenuShortcut(event, {
              dismiss: () => setOpen(false),
              zoomOut: onZoomOut && (() => { setOpen(false); onZoomOut(); }),
              foldViewToLevel: onFoldToLevel && ((level) => {
                onFoldToLevel(level);
                setOpen(false);
              }),
            });
          }}
        >
          <Menu aria-label="Document actions" className="remdo-menu">
            <MenuSection>
              <Header>Note</Header>
              <MenuItem onAction={() => onRename(note, triggerRef.current)}>Rename…</MenuItem>
            </MenuSection>
            {(onFoldToLevel || onZoomOut) && (
              <MenuSection>
                <Header>View</Header>
                {onZoomOut && <MenuItem onAction={onZoomOut}>Zoom <span className="note-menu-shortcut">o</span>ut</MenuItem>}
                {onFoldToLevel && <MenuItem onAction={() => onFoldToLevel(1)}>Fold to level [<span className="note-menu-shortcut">0-9</span>]</MenuItem>}
              </MenuSection>
            )}
          </Menu>
        </div>
      </Popover>
    </MenuTrigger>
  );
}

function DocumentRenameDialog({ target, onClose }: { target: RenameTarget; onClose: () => void }) {
  const [draft, setDraft] = useState(target.openingName);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const initiallyFocusedRef = useRef(false);
  const submit = async () => {
    if (pending) return;
    const name = draft.trim();
    if (!name) {
      setError('Enter a document name.');
      return;
    }
    if (name === target.openingName) {
      onClose();
      return;
    }
    setPending(true);
    setError(null);
    try {
      await target.note.rename(name);
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not rename the document. Please retry.');
      setPending(false);
    }
  };
  return (
    <ModalOverlay className="document-dialog-overlay" isDismissable={!pending} isKeyboardDismissDisabled={pending} isOpen onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
      <Modal className="document-dialog-modal">
        <Dialog className="document-dialog">
          <Heading slot="title">Rename document</Heading>
          <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
            <Stack gap="md">
              <TextInput
                autoFocus
                disabled={pending}
                error={error}
                errorProps={{ role: 'alert' }}
                label="Document name"
                onChange={(event) => { setDraft(event.currentTarget.value); setError(null); }}
                onFocus={(event) => {
                  if (!initiallyFocusedRef.current) {
                    event.currentTarget.select();
                    initiallyFocusedRef.current = true;
                  }
                }}
                value={draft}
              />
              {pending && <span role="status">Renaming…</span>}
              <Group justify="flex-end">
                <FormButton disabled={pending} onClick={onClose} variant="default">Cancel</FormButton>
                <FormButton disabled={pending} type="submit">Rename</FormButton>
              </Group>
            </Stack>
          </form>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- Hook owns the shared rename dialog lifecycle.
export function useDocumentRename(headingRef: RefObject<HTMLHeadingElement | null>) {
  const [target, setTarget] = useState<RenameTarget | null>(null);
  return {
    openRename: (note: DocumentNote, trigger: HTMLButtonElement | null) => {
      setTarget({ note, openingName: note.text(), trigger });
    },
    renameDialog: target && <DocumentRenameDialog target={target} onClose={() => {
      setTarget(null);
      requestAnimationFrame(() => {
        const destination = target.trigger?.isConnected ? target.trigger : headingRef.current;
        destination?.focus({ preventScroll: true });
      });
    }} />,
  };
}
