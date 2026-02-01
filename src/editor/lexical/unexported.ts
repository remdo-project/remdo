import type { LexicalEditor } from 'lexical';

// Copied from LexicalUtils.ts (data/.vendor/lexical/packages/lexical/src/LexicalUtils.ts)
// at commit c75b8e105ff9612f0166af22a518be01045fa72b. Keep in sync on Lexical upgrades.

const DOM_DOCUMENT_TYPE = 9;
const DOM_DOCUMENT_FRAGMENT_TYPE = 11;
const DOM_ELEMENT_TYPE = 1;

function isDOMNode(x: unknown): x is Node {
  return typeof x === 'object' && x !== null && 'nodeType' in x && typeof x.nodeType === 'number';
}

function isHTMLElement(x: unknown): x is HTMLElement {
  return isDOMNode(x) && x.nodeType === DOM_ELEMENT_TYPE;
}

function isDocumentFragment(x: unknown): x is DocumentFragment {
  return isDOMNode(x) && x.nodeType === DOM_DOCUMENT_FRAGMENT_TYPE;
}

function isDOMDocumentNode(node: unknown): node is Document {
  return isDOMNode(node) && node.nodeType === DOM_DOCUMENT_TYPE;
}

function getParentElement(node: Node): HTMLElement | null {
  const parentElement = (node as HTMLSlotElement).assignedSlot || node.parentElement;
  return isDocumentFragment(parentElement)
    ? ((parentElement as unknown as ShadowRoot).host as HTMLElement)
    : parentElement;
}

function getDOMOwnerDocument(target: EventTarget | null): Document | null {
  return isDOMDocumentNode(target)
    ? target
    : isHTMLElement(target)
      ? target.ownerDocument
      : null;
}

function getDefaultView(domElem: EventTarget | null): Window | null {
  const ownerDoc = getDOMOwnerDocument(domElem);
  return ownerDoc ? ownerDoc.defaultView : null;
}

function getWindow(editor: LexicalEditor): Window {
  const windowObj = (editor as LexicalEditor & { _window: Window | null })._window;
  if (windowObj === null) {
    throw new Error('Lexical editor window object not found');
  }
  return windowObj;
}

export function scrollIntoViewIfNeeded(
  editor: LexicalEditor,
  selectionRect: DOMRect,
  rootElement: HTMLElement
): void {
  const doc = getDOMOwnerDocument(rootElement);
  const defaultView = getDefaultView(doc);

  if (doc === null || defaultView === null) {
    return;
  }

  let { top: currentTop, bottom: currentBottom } = selectionRect;
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
