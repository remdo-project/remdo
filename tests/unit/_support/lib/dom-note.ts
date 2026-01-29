import type { RemdoTestApi } from '@/editor/plugins/dev';
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

export function getNoteTextNodes(remdo: RemdoTestApi, noteId: string): Text[] {
  const noteElement = getNoteElement(remdo, noteId);
  const walker = document.createTreeWalker(noteElement, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    if (current instanceof Text) {
      nodes.push(current);
    }
    current = walker.nextNode();
  }
  return nodes;
}
