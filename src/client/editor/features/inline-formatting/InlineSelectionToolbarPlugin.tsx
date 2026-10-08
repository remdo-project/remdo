import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $addUpdateTag, $onUpdate, COMMAND_PRIORITY_LOW, CONTROL_OR_META, HISTORY_PUSH_TAG, IS_APPLE, isExactShortcutMatch, KEY_DOWN_COMMAND, SET_TEXT_FORMAT_COMMAND } from 'lexical';
import type { LexicalEditor } from 'lexical';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCoarsePointer } from '#client/browser/useCoarsePointer';
import { stopHistoryCapture } from '#client/editor/runtime/history';
import { isAnyPopupActive, subscribeToActivePopup } from '#client/editor/triggers/active-popup';
import { $readInlineFormatTarget } from './selection';
import type { FormatStates, InlineFormat } from './selection';
import { $measureToolbarGeometry, placeToolbar } from './geometry';
import type { ToolbarGeometry } from './geometry';
import { InlineSelectionToolbar } from './InlineSelectionToolbar';
import './inline-formatting.css';

interface ToolbarView {
  fingerprint: string;
  states: FormatStates;
  geometry: ToolbarGeometry;
}

function ownsNativeRange(root: HTMLElement): boolean {
  const doc = root.ownerDocument;
  const selection = doc.getSelection();
  return doc.hasFocus() && root.contains(doc.activeElement) && root.contains(selection?.anchorNode ?? null)
    && root.contains(selection?.focusNode ?? null);
}

export function InlineSelectionToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const coarse = useCoarsePointer();
  useEffect(() => editor.registerCommand(KEY_DOWN_COMMAND, event => {
    if (event.isComposing || !isExactShortcutMatch(event, 'e', CONTROL_OR_META)) return false;
    const root = editor.getRootElement();
    if (!root || !ownsNativeRange(root)) return false;
    const target = $readInlineFormatTarget(editor);
    if (!target) return false;
    event.preventDefault();
    $formatInlineSelection(editor, 'code', target.states);
    return true;
  }, COMMAND_PRIORITY_LOW), [editor]);
  return coarse ? null : <FinePointerToolbar />;
}

function $formatInlineSelection(editor: LexicalEditor, format: InlineFormat, states: FormatStates) {
  stopHistoryCapture(editor);
  $addUpdateTag(HISTORY_PUSH_TAG);
  editor.dispatchCommand(SET_TEXT_FORMAT_COMMAND, { [format]: states[format] !== 'all' });
  $onUpdate(() => stopHistoryCapture(editor));
}

function FinePointerToolbar() {
  const [editor] = useLexicalComposerContext();
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<ToolbarView | null>(null);
  const activationRef = useRef<string | null>(null);
  const pointerRef = useRef(false);
  const composingRef = useRef(false);
  const scheduleRef = useRef<() => void>(() => {});
  const [view, setView] = useState<ToolbarView | null>(null);

  useEffect(() => {
    const doc = editor.getRootElement()!.ownerDocument;
    const win = doc.defaultView!;
    let frame = 0;
    let disposed = false;
    const hide = () => {
      viewRef.current = null;
      setView(null);
    };
    const refresh = () => {
      frame = 0;
      const root = editor.getRootElement();
      if (!root || pointerRef.current || composingRef.current
        || !ownsNativeRange(root)) {
        hide();
        return;
      }
      const next = editor.getEditorState().read(() => {
        const target = $readInlineFormatTarget(editor);
        if (!target) return null;
        const geometry = $measureToolbarGeometry(editor, target.slices);
        return geometry ? { fingerprint: target.fingerprint, states: target.states, geometry } : null;
      });
      if (!next) {
        hide();
        return;
      }
      viewRef.current = next;
      setView(next);
    };
    // SelectionPlugin publishes and may snap after a committed update. Paint
    // only at the next frame, after those model writes and native motion settle.
    const schedule = () => {
      if (disposed) return;
      win.cancelAnimationFrame(frame);
      frame = win.requestAnimationFrame(refresh);
    };
    scheduleRef.current = schedule;
    const pointerDown = (event: MouseEvent) => {
      if (event.button !== 0 || toolbarRef.current?.contains(event.target as Node)) return;
      pointerRef.current = true;
      hide();
    };
    const pointerEnd = (event: MouseEvent) => {
      if (event.type !== 'pointercancel' && event.button !== 0) return;
      pointerRef.current = false;
      schedule();
    };
    const blur = () => { pointerRef.current = false; hide(); };
    const compositionStart = () => { composingRef.current = true; hide(); };
    const compositionEnd = () => { composingRef.current = false; schedule(); };
    const resizeObserver = new ResizeObserver(schedule);
    const unregisterRoot = editor.registerRootListener((root, previous) => {
      if (previous) {
        previous.removeEventListener('compositionstart', compositionStart);
        previous.removeEventListener('compositionend', compositionEnd);
        resizeObserver.unobserve(previous);
      }
      if (root) {
        // eslint-disable-next-line react/web-api-no-leaked-event-listener -- root listener removes on replacement and effect cleanup.
        root.addEventListener('compositionstart', compositionStart);
        // eslint-disable-next-line react/web-api-no-leaked-event-listener -- root listener removes on replacement and effect cleanup.
        root.addEventListener('compositionend', compositionEnd);
        resizeObserver.observe(root);
      }
      schedule();
    });
    const unregisterUpdate = editor.registerUpdateListener(schedule);
    const unregisterEditable = editor.registerEditableListener(schedule);
    const unregisterPopup = subscribeToActivePopup(editor, () => {
      if (isAnyPopupActive(editor)) hide();
      else schedule();
    });
    doc.addEventListener('pointerdown', pointerDown, true);
    doc.addEventListener('pointerup', pointerEnd, true);
    doc.addEventListener('pointercancel', pointerEnd, true);
    // Mouse events report each button change when chorded pointer events report only motion.
    doc.addEventListener('mousedown', pointerDown, true);
    doc.addEventListener('mouseup', pointerEnd, true);
    doc.addEventListener('selectionchange', schedule);
    doc.addEventListener('focusin', schedule);
    doc.addEventListener('focusout', schedule);
    doc.addEventListener('scroll', schedule, true);
    win.addEventListener('resize', schedule);
    win.addEventListener('blur', blur);
    win.addEventListener('focus', schedule);
    win.visualViewport?.addEventListener('resize', schedule);
    win.visualViewport?.addEventListener('scroll', schedule);
    return () => {
      disposed = true;
      win.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      unregisterRoot();
      unregisterUpdate();
      unregisterEditable();
      unregisterPopup();
      doc.removeEventListener('pointerdown', pointerDown, true);
      doc.removeEventListener('pointerup', pointerEnd, true);
      doc.removeEventListener('pointercancel', pointerEnd, true);
      doc.removeEventListener('mousedown', pointerDown, true);
      doc.removeEventListener('mouseup', pointerEnd, true);
      doc.removeEventListener('selectionchange', schedule);
      doc.removeEventListener('focusin', schedule);
      doc.removeEventListener('focusout', schedule);
      doc.removeEventListener('scroll', schedule, true);
      win.removeEventListener('resize', schedule);
      win.removeEventListener('blur', blur);
      win.removeEventListener('focus', schedule);
      win.visualViewport?.removeEventListener('resize', schedule);
      win.visualViewport?.removeEventListener('scroll', schedule);
    };
  }, [editor]);

  useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    if (!view || !toolbar) return;
    const measure = () => {
      const rect = toolbar.getBoundingClientRect();
      const position = placeToolbar(view.geometry, rect.width, rect.height);
      toolbar.style.visibility = position ? 'visible' : 'hidden';
      if (position) {
        toolbar.style.left = `${position.left}px`;
        toolbar.style.top = `${position.top}px`;
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, [view]);

  const format = (formatType: InlineFormat) => {
    const expected = activationRef.current;
    activationRef.current = null;
    const root = editor.getRootElement();
    if (root && ownsNativeRange(root) && expected && !pointerRef.current && !composingRef.current) {
      editor.update(() => {
        const target = $readInlineFormatTarget(editor);
        if (target?.fingerprint === expected) $formatInlineSelection(editor, formatType, target.states);
      });
    }
    scheduleRef.current();
  };

  return view ? createPortal(
    <InlineSelectionToolbar
      toolbarRef={toolbarRef}
      states={view.states}
      mac={IS_APPLE}
      onFormatStart={() => { activationRef.current = viewRef.current?.fingerprint ?? null; }}
      onFormat={format}
    />,
    editor.getRootElement()!.ownerDocument.body,
  ) : null;
}
