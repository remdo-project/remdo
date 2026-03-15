import { isHTMLAnchorElement } from '@lexical/utils';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';
import { $getSelection, $isRangeSelection } from 'lexical';

function findAnchor(startNode: Node): HTMLAnchorElement | null {
  let node: Node | null = startNode;
  while (node !== null) {
    if (isHTMLAnchorElement(node)) {
      return node;
    }
    node = node.parentNode;
  }
  return null;
}

export function BlankTargetLinkInterceptorPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      const anchor = findAnchor(target);
      if (anchor === null || anchor.target !== '_blank' || anchor.href.length === 0) {
        return;
      }

      const selection = editor.getEditorState().read($getSelection);
      if ($isRangeSelection(selection) && !selection.isCollapsed()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const openedWindow = globalThis.open(anchor.href, '_blank', 'noopener,noreferrer');
      if (openedWindow) {
        openedWindow.opener = null;
      }
      event.preventDefault();
      event.stopPropagation();
    };

    const onMouseUp = (event: MouseEvent) => {
      if (event.button === 1) {
        onClick(event);
      }
    };

    let currentRootElement: null | HTMLElement = null;
    const unregisterRootListener = editor.registerRootListener((rootElement, prevRootElement) => {
      if (prevRootElement !== null) {
        prevRootElement.removeEventListener('click', onClick, true);
        prevRootElement.removeEventListener('mouseup', onMouseUp, true);
      }
      if (rootElement !== null) {
        // Capture-phase interception is intentional so Lexical's clickable-link plugin
        // never gets a chance to reopen _blank links without noopener.
        // eslint-disable-next-line react-web-api/no-leaked-event-listener
        rootElement.addEventListener('click', onClick, true);
        // eslint-disable-next-line react-web-api/no-leaked-event-listener
        rootElement.addEventListener('mouseup', onMouseUp, true);
      }
      currentRootElement = rootElement;
    });

    return () => {
      if (currentRootElement !== null) {
        currentRootElement.removeEventListener('click', onClick, true);
        currentRootElement.removeEventListener('mouseup', onMouseUp, true);
      }
      unregisterRootListener();
    };
  }, [editor]);

  return null;
}
