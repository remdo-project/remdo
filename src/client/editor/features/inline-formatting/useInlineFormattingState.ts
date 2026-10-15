import type { LexicalEditor } from 'lexical';
import { mergeRegister } from 'lexical';
import { useEffect, useState } from 'react';
import { subscribeToActivePopup } from '#client/editor/triggers/active-popup';
import { $readInlineFormatTarget } from './selection';
import type { InlineFormatTarget } from './selection';

export function useInlineFormattingState(editor: LexicalEditor, isActive: () => boolean) {
  const [state, setState] = useState<{ editable: boolean; target: InlineFormatTarget | null }>(
    () => ({ editable: editor.isEditable(), target: null }),
  );

  useEffect(() => {
    const doc = editor.getRootElement()!.ownerDocument;
    const win = doc.defaultView!;
    let frame = 0;
    let composing = false;
    const refresh = () => {
      const editable = editor.isEditable();
      const target = !composing && isActive()
        ? editor.getEditorState().read(() => $readInlineFormatTarget(editor))
        : null;
      setState(previous => previous.editable === editable && previous.target?.fingerprint === target?.fingerprint
        ? previous : { editable, target });
    };
    // Selection publication and whole-note snapping settle after editor updates.
    const schedule = () => {
      win.cancelAnimationFrame(frame);
      frame = win.requestAnimationFrame(refresh);
    };
    const compositionStart = () => { composing = true; schedule(); };
    const compositionEnd = () => { composing = false; schedule(); };
    const unregister = mergeRegister(
      editor.registerUpdateListener(schedule),
      editor.registerEditableListener(schedule),
      subscribeToActivePopup(editor, schedule),
      editor.registerRootListener((root, previous) => {
        previous?.removeEventListener('compositionstart', compositionStart);
        previous?.removeEventListener('compositionend', compositionEnd);
        // eslint-disable-next-line react/web-api-no-leaked-event-listener -- root replacement and effect cleanup remove this binding.
        root?.addEventListener('compositionstart', compositionStart);
        // eslint-disable-next-line react/web-api-no-leaked-event-listener -- root replacement and effect cleanup remove this binding.
        root?.addEventListener('compositionend', compositionEnd);
        schedule();
      }),
    );
    doc.addEventListener('selectionchange', schedule);
    doc.addEventListener('focusin', schedule);
    doc.addEventListener('focusout', schedule);
    win.addEventListener('focus', schedule);
    win.addEventListener('blur', schedule);
    return () => {
      unregister();
      win.cancelAnimationFrame(frame);
      doc.removeEventListener('selectionchange', schedule);
      doc.removeEventListener('focusin', schedule);
      doc.removeEventListener('focusout', schedule);
      win.removeEventListener('focus', schedule);
      win.removeEventListener('blur', schedule);
      editor.getRootElement()?.removeEventListener('compositionstart', compositionStart);
      editor.getRootElement()?.removeEventListener('compositionend', compositionEnd);
    };
  }, [editor, isActive]);

  return state;
}
