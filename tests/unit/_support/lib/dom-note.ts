import type { RemdoTestApi } from '#client/editor/plugins/dev';
import { getNoteKey } from './note';

export function getNoteElement(remdo: RemdoTestApi, noteId: string) {
  const key = getNoteKey(remdo, noteId);
  const element = remdo.editor.getElementByKey(key);
  if (!element) {
    throw new TypeError(`Expected element for noteId: ${noteId}`);
  }
  return element;
}

function firstTextNodeIn(element: Element | null | undefined, label: string): Text {
  if (!element) {
    throw new TypeError(`Expected element for ${label}`);
  }
  const textNode = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode();
  if (!(textNode instanceof Text)) {
    throw new TypeError(`Expected text node for ${label}`);
  }
  return textNode;
}

export function getNoteTextNode(remdo: RemdoTestApi, noteId: string): Text {
  const textElement = getNoteElement(remdo, noteId).querySelector('[data-lexical-text="true"]');
  return firstTextNodeIn(textElement, `noteId: ${noteId}`);
}

// The first text node inside the body attached to `noteId`. The body lives in a
// body-wrapper, the note element's next `li` sibling; its `.note-body` holds the
// body text.
export function getNoteBodyTextNode(remdo: RemdoTestApi, noteId: string): Text {
  const bodyElement = getNoteElement(remdo, noteId).nextElementSibling?.querySelector('.note-body');
  return firstTextNodeIn(bodyElement, `body of noteId: ${noteId}`);
}
