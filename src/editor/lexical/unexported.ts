import type { LexicalEditor } from 'lexical';

// Copied from LexicalUtils.ts (data/.vendor/lexical/packages/lexical/src/LexicalUtils.ts)
// at commit c75b8e105ff9612f0166af22a518be01045fa72b. Keep in sync on Lexical upgrades.
// Drift is checked by tools/check-lexical-utils.js (pnpm run lint:lexical) using the BEGIN/END markers.

const DOM_DOCUMENT_TYPE = 9;
const DOM_DOCUMENT_FRAGMENT_TYPE = 11;
const DOM_ELEMENT_TYPE = 1;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

// BEGIN COPIED: isDOMNode
export function isDOMNode(x: unknown): x is Node {
  return (
    typeof x === 'object' &&
    x !== null &&
    'nodeType' in x &&
    typeof x.nodeType === 'number'
  );
}
// END COPIED: isDOMNode

// BEGIN COPIED: isHTMLElement
export function isHTMLElement(x: unknown): x is HTMLElement {
  return isDOMNode(x) && x.nodeType === DOM_ELEMENT_TYPE;
}
// END COPIED: isHTMLElement

// BEGIN COPIED: isDocumentFragment
export function isDocumentFragment(x: unknown): x is DocumentFragment {
  return isDOMNode(x) && x.nodeType === DOM_DOCUMENT_FRAGMENT_TYPE;
}
// END COPIED: isDocumentFragment

// BEGIN COPIED: isDOMDocumentNode
export function isDOMDocumentNode(node: unknown): node is Document {
  return isDOMNode(node) && node.nodeType === DOM_DOCUMENT_TYPE;
}
// END COPIED: isDOMDocumentNode

// BEGIN COPIED: getParentElement
export function getParentElement(node: Node): HTMLElement | null {
  const parentElement =
    (node as HTMLSlotElement).assignedSlot || node.parentElement;
  return isDocumentFragment(parentElement)
    ? ((parentElement as unknown as ShadowRoot).host as HTMLElement)
    : parentElement;
}
// END COPIED: getParentElement

// BEGIN COPIED: getDOMOwnerDocument
export function getDOMOwnerDocument(
  target: EventTarget | null,
): Document | null {
  return isDOMDocumentNode(target)
    ? target
    : isHTMLElement(target)
      ? target.ownerDocument
      : null;
}
// END COPIED: getDOMOwnerDocument

// BEGIN COPIED: getDefaultView
export function getDefaultView(domElem: EventTarget | null): Window | null {
  const ownerDoc = getDOMOwnerDocument(domElem);
  return ownerDoc ? ownerDoc.defaultView : null;
}
// END COPIED: getDefaultView

/* eslint-disable ts/no-unnecessary-condition */
// BEGIN COPIED: getWindow
export function getWindow(editor: LexicalEditor): Window {
  const windowObj = editor._window;
  if (windowObj === null) {
    invariant(false, 'window object not found');
  }
  return windowObj;
}
// END COPIED: getWindow
/* eslint-enable ts/no-unnecessary-condition */

// BEGIN COPIED: scrollIntoViewIfNeeded
export function scrollIntoViewIfNeeded(
  editor: LexicalEditor,
  selectionRect: DOMRect,
  rootElement: HTMLElement,
): void {
  const doc = getDOMOwnerDocument(rootElement);
  const defaultView = getDefaultView(doc);

  if (doc === null || defaultView === null) {
    return;
  }
  let {top: currentTop, bottom: currentBottom} = selectionRect;
  let targetTop = 0;
  let targetBottom = 0;
  let element: HTMLElement | null = rootElement;

  while (element !== null) {
    const isBodyElement = element === doc.body;
    if (isBodyElement) {
      targetTop = 0;
      targetBottom = getWindow(editor).innerHeight;
    } else {
      const targetRect = element.getBoundingClientRect();
      targetTop = targetRect.top;
      targetBottom = targetRect.bottom;
    }
    let diff = 0;

    if (currentTop < targetTop) {
      diff = -(targetTop - currentTop);
    } else if (currentBottom > targetBottom) {
      diff = currentBottom - targetBottom;
    }

    if (diff !== 0) {
      if (isBodyElement) {
        // Only handles scrolling of Y axis
        defaultView.scrollBy(0, diff);
      } else {
        const scrollTop = element.scrollTop;
        element.scrollTop += diff;
        const yOffset = element.scrollTop - scrollTop;
        currentTop -= yOffset;
        currentBottom -= yOffset;
      }
    }
    if (isBodyElement) {
      break;
    }
    element = getParentElement(element);
  }
}
// END COPIED: scrollIntoViewIfNeeded
