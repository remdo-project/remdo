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
    // The dialog's focus scope restores the invoking button on its own. Only
    // a button that no longer exists needs the heading fallback that
    // docs/specs/outliner/menu.md requires.
    if (trigger?.isConnected) return;
    requestAnimationFrame(() => fallbackRef.current?.focus({ preventScroll: true }));
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
