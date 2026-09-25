import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';
import { $getSelection, $isRangeSelection, isHTMLAnchorElement } from 'lexical';

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
    const interceptLink = (event: MouseEvent, isMiddle: boolean) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      const anchor = findAnchor(target);
      if (anchor === null || anchor.href.length === 0) {
        return;
      }
      const opensBlank = anchor.target === '_blank';
      // Lexical 0.51 opens a middle-clicked link in a new tab; RemDo keeps other links in this tab.
      if (!opensBlank && !isMiddle) {
        return;
      }

      const selection = editor.getEditorState().read($getSelection);
      if ($isRangeSelection(selection) && !selection.isCollapsed()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (opensBlank) {
        globalThis.open(anchor.href, '_blank', 'noopener,noreferrer');
      } else {
        globalThis.open(anchor.href, '_self');
      }
      event.preventDefault();
      event.stopPropagation();
    };

    const onClick = (event: MouseEvent) => {
      interceptLink(event, false);
    };

    const onAuxClick = (event: MouseEvent) => {
      if (event.button === 1) {
        interceptLink(event, true);
      }
    };

    let currentRootElement: null | HTMLElement = null;
    const unregisterRootListener = editor.registerRootListener((rootElement, prevRootElement) => {
      if (prevRootElement !== null) {
        prevRootElement.removeEventListener('click', onClick, true);
        prevRootElement.removeEventListener('auxclick', onAuxClick, true);
      }
      if (rootElement !== null) {
        // Capture-phase interception is intentional so Lexical's clickable-link plugin
        // never gets a chance to reopen _blank links without noopener.
        // eslint-disable-next-line react/web-api-no-leaked-event-listener
        rootElement.addEventListener('click', onClick, true);
        // eslint-disable-next-line react/web-api-no-leaked-event-listener
        rootElement.addEventListener('auxclick', onAuxClick, true);
      }
      currentRootElement = rootElement;
    });

    return () => {
      if (currentRootElement !== null) {
        currentRootElement.removeEventListener('click', onClick, true);
        currentRootElement.removeEventListener('auxclick', onAuxClick, true);
      }
      unregisterRootListener();
    };
  }, [editor]);

  return null;
}
