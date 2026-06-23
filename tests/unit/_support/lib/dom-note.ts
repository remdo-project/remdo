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

export function getNoteTextNode(remdo: RemdoTestApi, noteId: string): Text {
  const noteElement = getNoteElement(remdo, noteId);
  const textElement = noteElement.querySelector('[data-lexical-text="true"]');
  if (!textElement) {
    throw new TypeError(`Expected text element for noteId: ${noteId}`);
  }
  const walker = document.createTreeWalker(textElement, NodeFilter.SHOW_TEXT);
  const textNode = walker.nextNode();
  if (!(textNode instanceof Text)) {
    throw new TypeError(`Expected text node for noteId: ${noteId}`);
  }
  return textNode;
}

// The first text node inside the body attached to `noteId`. The body lives in a
// body-wrapper, the note element's next `li` sibling; its `.note-body` holds the
// body text.
export function getNoteBodyTextNode(remdo: RemdoTestApi, noteId: string): Text {
  const bodyElement = getNoteElement(remdo, noteId).nextElementSibling?.querySelector('.note-body');
  if (!bodyElement) {
    throw new TypeError(`Expected body element for noteId: ${noteId}`);
  }
  const walker = document.createTreeWalker(bodyElement, NodeFilter.SHOW_TEXT);
  const textNode = walker.nextNode();
  if (!(textNode instanceof Text)) {
    throw new TypeError(`Expected body text node for noteId: ${noteId}`);
  }
  return textNode;
}
