import type { RemdoTestApi } from '#client/editor/dev';
import { getNoteKey } from './note';
import type { NoteRef } from './note';

export function getNoteElement(remdo: RemdoTestApi, note: NoteRef) {
  const key = getNoteKey(remdo, note);
  const element = remdo.editor.getElementByKey(key);
  if (!element) {
    throw new TypeError(`Expected element for note: ${JSON.stringify(note)}`);
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

export function getNoteTextNode(remdo: RemdoTestApi, note: NoteRef): Text {
  const textElement = getNoteElement(remdo, note).querySelector('[data-lexical-text="true"]');
  return firstTextNodeIn(textElement, `note: ${JSON.stringify(note)}`);
}

// The first text node inside the body attached to `note`. The body lives in a
// body-wrapper, the note element's next `li` sibling; its `.note-body` holds the
// body text.
export function getNoteBodyTextNode(remdo: RemdoTestApi, note: NoteRef): Text {
  const bodyElement = getNoteElement(remdo, note).nextElementSibling?.querySelector('.note-body');
  return firstTextNodeIn(bodyElement, `body of note: ${JSON.stringify(note)}`);
}
