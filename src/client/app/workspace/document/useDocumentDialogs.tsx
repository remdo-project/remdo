import { useState } from 'react';
import type { DocumentNote } from '#note-sdk';
import { DocumentRenameDialog } from './DocumentRenameDialog';
import { DocumentShareDialog } from './DocumentShareDialog';

type DialogKind = 'rename' | 'share';
interface Target {
  kind: DialogKind;
  note: DocumentNote;
  trigger: HTMLButtonElement | null;
}

export function useDocumentDialogs(fallbackRef: { current: HTMLElement | null }) {
  const [target, setTarget] = useState<Target | null>(null);

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

  const open = (kind: DialogKind) => (note: DocumentNote, trigger: HTMLButtonElement | null) => {
    setTarget({ kind, note, trigger });
  };

  return {
    openRename: open('rename'),
    openShare: open('share'),
    documentDialog: target && (target.kind === 'rename'
      ? <DocumentRenameDialog key={target.note.getId()} note={target.note} onClose={close} />
      : <DocumentShareDialog docId={target.note.getId()} key={target.note.getId()} onClose={close} />),
  };
}
