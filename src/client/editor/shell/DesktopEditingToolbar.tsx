import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useCallback, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { OpenDocument } from '#note-sdk';
import { DesktopEditingToolbarPlugin } from '#client/editor/desktop-toolbar/DesktopEditingToolbarPlugin';
import { getViewRoot, subscribeViewRoot } from '#client/editor/outline/view-root';

export function DesktopEditingToolbar({ openDocument, portalRoot }: {
  openDocument: OpenDocument;
  portalRoot: HTMLElement | null;
}) {
  const [editor] = useLexicalComposerContext();
  const subscribe = useCallback((listener: () => void) => subscribeViewRoot(editor, listener), [editor]);
  const snapshot = useCallback(() => getViewRoot(editor), [editor]);
  const zoomRootKey = useSyncExternalStore(subscribe, snapshot, snapshot);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!zoomRootKey) return;
    const host = hostRef.current!;
    const container = host.parentElement!;
    let title: HTMLElement | null = null;
    let frame = 0;
    function schedule() {
      if (!frame) frame = requestAnimationFrame(measure);
    }
    const observer = new ResizeObserver(schedule);
    const clearTitle = () => {
      if (!title) return;
      observer.unobserve(title);
      delete title.dataset.desktopToolbar;
      title.style.removeProperty('--desktop-toolbar-width');
      title.style.removeProperty('--desktop-toolbar-height');
    };
    function measure() {
      frame = 0;
      const nextTitle = editor.getElementByKey(zoomRootKey!);
      if (title !== nextTitle) {
        clearTitle();
        title = nextTitle;
        if (title) observer.observe(title);
      }
      if (!title) return;
      const toolbar = host.querySelector<HTMLElement>('.desktop-editing-toolbar')!;
      const style = getComputedStyle(container);
      const insetStart = Number.parseFloat(style.paddingLeft);
      const insetEnd = Number.parseFloat(style.paddingRight);
      const availableWidth = container.clientWidth - insetStart - insetEnd;
      const toolbarWidth = toolbar.scrollWidth;
      const toolbarHeight = toolbar.offsetHeight;
      const rem = Number.parseFloat(getComputedStyle(container.ownerDocument.documentElement).fontSize);
      // Match the document header's 14rem title allowance and 1rem gap.
      const beside = availableWidth >= toolbarWidth + 15 * rem;

      // Keep the rich title in Lexical's DOM; reserve space for the sibling
      // toolbar instead of moving editable content into a separate header.
      title.dataset.desktopToolbar = beside ? 'beside' : 'below';
      title.style.setProperty('--desktop-toolbar-width', `${toolbarWidth}px`);
      title.style.setProperty('--desktop-toolbar-height', `${toolbarHeight}px`);
      const titleRect = title.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const top = beside
        ? titleRect.top - containerRect.top + (titleRect.height - toolbarHeight) / 2
        : titleRect.bottom - containerRect.top + 0.5 * rem;
      host.style.top = `${top}px`;
      host.style.left = `${beside ? container.clientWidth - insetEnd - toolbarWidth : insetStart}px`;
      host.style.width = `${beside ? toolbarWidth : availableWidth}px`;
    }
    observer.observe(container);
    observer.observe(host);
    const unregister = editor.registerUpdateListener(schedule);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      unregister();
      clearTitle();
      observer.disconnect();
    };
  }, [editor, zoomRootKey]);

  const toolbar = <DesktopEditingToolbarPlugin openDocument={openDocument} />;
  if (zoomRootKey) return <div className="desktop-editing-toolbar-zoom-host" ref={hostRef}>{toolbar}</div>;
  return portalRoot ? createPortal(toolbar, portalRoot) : null;
}
