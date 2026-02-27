export type OutlineSelectionKind = 'caret' | 'inline' | 'structural';

export interface OutlineSelectionRange {
  headStartKey: string;
  headEndKey: string;
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
  range: OutlineSelectionRange | null;
  isBackward: boolean;
}
