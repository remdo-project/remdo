export type OutlineSelectionKind = 'caret' | 'inline' | 'structural';

export interface OutlineSelectionRange {
  caretStartKey: string;
  caretEndKey: string;
  visualStartKey: string;
  visualEndKey: string;
}

export interface OutlineSelection {
  kind: OutlineSelectionKind;
  stage: number;
  anchorKey: string | null;
  focusKey: string | null;
  headKeys: string[];
  selectedKeys: string[];
  range: OutlineSelectionRange | null;
  isBackward: boolean;
}
