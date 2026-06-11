export interface PickerAnchor {
  left: number;
  top: number;
}

export interface DatePickerState {
  anchor: PickerAnchor;
  isoDate: string;
  kind: 'edit';
  nodeKey: string;
}
