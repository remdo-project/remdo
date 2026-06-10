import type { TextNode } from 'lexical';

export interface DateQuerySession {
  textNodeKey: string;
  triggerOffset: number;
}

export interface PickerAnchor {
  left: number;
  top: number;
}

export interface ActiveDateQuery {
  triggerNode: TextNode;
  anchorNode: TextNode;
  caretOffset: number;
  query: string;
}

export type DatePickerState =
  | {
      anchor: PickerAnchor;
      isoDate: string;
      kind: 'insert';
    }
  | {
      anchor: PickerAnchor;
      isoDate: string;
      kind: 'edit';
      nodeKey: string;
    };
