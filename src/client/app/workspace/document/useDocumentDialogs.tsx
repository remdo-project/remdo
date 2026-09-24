import { useEffect, useRef, useState } from 'react';
import type { DocumentNote } from '#note-sdk';
import { DocumentDeleteDialog } from './DocumentDeleteDialog';
import { DocumentRenameDialog } from './DocumentRenameDialog';
import { DocumentShareDialog } from './DocumentShareDialog';

type DialogKind = 'delete' | 'rename' | 'share';
interface Target {
  kind: DialogKind;
  note: DocumentNote;
  trigger: HTMLButtonElement | null;
}

export function useDocumentDialogs(fallbackRef: { current: HTMLElement | null }) {
  const [target, setTarget] = useState<Target | null>(null);
  const restoredTriggerRef = useRef<HTMLButtonElement | null>(null);

  // A row can leave in a listing update that lands after the dialog restored
  // focus to the row's button, as a deletion's does, dropping focus to the
  // body; docs/specs/outliner/menu.md sends it to the heading instead.
  useEffect(() => {
    const trigger = restoredTriggerRef.current;
    if (!trigger || trigger.isConnected) return;
    restoredTriggerRef.current = null;
    if (document.activeElement === document.body) fallbackRef.current?.focus({ preventScroll: true });
  });

  const close = () => {
    const trigger = target?.trigger;
    setTarget(null);
    // The dialog's focus scope restores the invoking button on its own. Only
    // a button that no longer exists needs the heading fallback.
    if (trigger?.isConnected) {
      restoredTriggerRef.current = trigger;
      return;
    }
    requestAnimationFrame(() => fallbackRef.current?.focus({ preventScroll: true }));
  };

  const open = (kind: DialogKind) => (note: DocumentNote, trigger: HTMLButtonElement | null) => {
    setTarget({ kind, note, trigger });
  };

  return {
    openDelete: open('delete'),
    openRename: open('rename'),
    openShare: open('share'),
    documentDialog: target && {
      delete: <DocumentDeleteDialog key={target.note.getId()} note={target.note} onClose={close} />,
      rename: <DocumentRenameDialog key={target.note.getId()} note={target.note} onClose={close} />,
      share: <DocumentShareDialog docId={target.note.getId()} key={target.note.getId()} onClose={close} />,
    }[target.kind],
  };
}
