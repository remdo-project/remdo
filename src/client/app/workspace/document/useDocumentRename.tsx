import { useState } from 'react';
import type { DocumentNote } from '#note-sdk';
import { DocumentRenameDialog } from './DocumentRenameDialog';

export function useDocumentRename(fallbackRef: { current: HTMLElement | null }) {
  const [target, setTarget] = useState<{ note: DocumentNote; trigger: HTMLButtonElement | null } | null>(null);

  const close = () => {
    const trigger = target?.trigger;
    setTarget(null);
    // Focus lands after the modal's own focus handling runs on unmount,
    // which would otherwise move it away from the invoking button.
    requestAnimationFrame(() => {
      const destination = trigger?.isConnected ? trigger : fallbackRef.current;
      destination?.focus({ preventScroll: true });
    });
  };

  return {
    openRename: (note: DocumentNote, trigger: HTMLButtonElement | null) => {
      setTarget({ note, trigger });
    },
    renameDialog: target && <DocumentRenameDialog key={target.note.getId()} note={target.note} onClose={close} />,
  };
}
