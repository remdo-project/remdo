import type { RemdoTestApi } from '@/editor/plugins/dev';
import { getNoteKeyById } from './note';

export function getNoteElementById(remdo: RemdoTestApi, noteId: string) {
  const key = getNoteKeyById(remdo, noteId);
  const element = remdo.editor.getElementByKey(key);
  if (!element) {
    throw new TypeError(`Expected element for noteId: ${noteId}`);
  }
  return element;
}

export function getNoteTextNodeById(remdo: RemdoTestApi, noteId: string): Text {
  const noteElement = getNoteElementById(remdo, noteId);
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
