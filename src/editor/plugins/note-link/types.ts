import type { LinkPickerOption } from '@/editor/links/note-link-index';
import type { TextNode } from 'lexical';

export interface LinkQuerySession {
  textNodeKey: string;
  triggerOffset: number;
}

export interface PickerAnchor {
  left: number;
  top: number;
}

export interface LinkPickerState {
  query: string;
  options: LinkPickerOption[];
  activeIndex: number;
  anchor: PickerAnchor;
}

export interface ActiveLinkQuery {
  triggerNode: TextNode;
  anchorNode: TextNode;
  caretOffset: number;
  query: string;
}
