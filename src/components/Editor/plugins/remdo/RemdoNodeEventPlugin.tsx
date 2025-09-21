/* Copy of LexicalNodeEventPlugin that allows to catch events on RootNode
 * $findMatchingParent skips root for some reason - TODO report as a lexical bug
 * plus bubles event up to the root regardless if the event belongs to "capturedEvents"
 * TODO send a pull request that will allow to pass capturedEvents as a parameter
 */
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import type { Klass, LexicalEditor, LexicalNode, NodeKey } from "lexical";

/* remdo customization
import {$findMatchingParent} from '@lexical/utils';
*/
import { $getNearestNodeFromDOMNode } from "lexical";
import { useEffect, useRef } from "react";

const capturedEvents = new Set<string>(["mouseenter", "mouseleave"]);

export function RemdoNodeEventPlugin({
  nodeType,
  eventType,
  eventListener,
}: {
  nodeType: Klass<LexicalNode>;
  eventType: string;
  eventListener: (
    event: Event,
    editor: LexicalEditor,
    nodeKey: NodeKey
  ) => void;
}): null {
  const [editor] = useLexicalComposerContext();
  const listenerRef = useRef(eventListener);

  listenerRef.current = eventListener;

  useEffect(() => {
    const isCaptured = capturedEvents.has(eventType);
    let activeRoot: HTMLElement | null = null;

    const onEvent = (event: Event) => {
      editor.update(() => {
        const nearestNode = $getNearestNodeFromDOMNode(event.target as Element);
        if (nearestNode !== null) {
          /* remdo customization
          const targetNode = isCaptured
            ? nearestNode instanceof nodeType
              ? nearestNode
              : null
            : $findMatchingParent(
                nearestNode,
                (node) => node instanceof nodeType,
              );
          */
          const targetNode = nearestNode
            .getParents()
            .find((node) => node instanceof nodeType);
          /* end remdo customization */
          if (targetNode !== null) {
            listenerRef.current(event, editor, targetNode.getKey());
          }
        }
      });
    };

    const unregisterRootListener = editor.registerRootListener((rootElement, prevRootElement) => {
      if (rootElement) {
        // TODO: Evaluate exposing this logic as a Lexical command so we can
        // avoid wiring DOM listeners directly and appease
        // `react-web-api/no-leaked-event-listener`. The current approach mirrors
        // Lexical's own plugin but the rule cannot infer the nested cleanup.
        // eslint-disable-next-line react-web-api/no-leaked-event-listener
        rootElement.addEventListener(eventType, onEvent, isCaptured);
        activeRoot = rootElement;
      }

      if (prevRootElement) {
        prevRootElement.removeEventListener(eventType, onEvent, isCaptured);
        if (activeRoot === prevRootElement) {
          activeRoot = null;
        }
      }
    });
    // We intentionally don't respect changes to eventType.
    return () => {
      if (activeRoot) {
        activeRoot.removeEventListener(eventType, onEvent, isCaptured);
        activeRoot = null;
      }
      unregisterRootListener();
    };
  }, [editor, eventType, nodeType]);

  return null;
}
