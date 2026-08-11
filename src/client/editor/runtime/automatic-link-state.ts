import type { AutoLinkNode } from '@lexical/link';
import { $getState, $setState, createState } from 'lexical';

const unlinkedTextState = createState('autoLinkUnlinkedText', {
  parse: (value) => (typeof value === 'string' ? value : null),
});

export function $getAutomaticLinkUnlinkedText(node: AutoLinkNode): string | null {
  return $getState(node, unlinkedTextState);
}

export function $setAutomaticLinkUnlinkedText(node: AutoLinkNode, text: string | null): void {
  $setState(node, unlinkedTextState, text);
}
