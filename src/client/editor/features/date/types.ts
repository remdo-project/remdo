export interface PickerAnchor {
  left: number;
  top: number;
}

export interface DatePickerState {
  anchor: PickerAnchor;
  isoDate: string;
  nodeKey: string;
}
