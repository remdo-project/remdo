import type { PickerAnchor } from '#client/editor/triggers/types';

export interface DatePickerState {
  anchor: PickerAnchor;
  isoDate: string;
  nodeKey: string;
}
