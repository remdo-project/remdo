// The outline tree's JSON, shared with backend/workspaces/text_format.py (`to_json`, `from_json`).

export type Mark = 'bold' | 'code' | 'italic' | 'strike' | 'underline';

export type Run =
  | { kind: 'text'; text: string; marks: Mark[] }
  | { kind: 'link'; href: string; runs: Run[] }
  | { kind: 'date'; date: string }
  | { kind: 'verbatim'; text: string };

export type Marker =
  | { kind: 'bullet' }
  | { kind: 'number'; start: number | null }
  | { kind: 'heading'; level: number };

export interface OutlineNote {
  kind: 'outline';
  marker: Marker;
  checkbox: 'open' | 'checked' | null;
  name: string | null;
  runs: Run[];
  id: string | null;
  cacheId: string | null;
  children: TreeNote[];
}

export interface Body {
  kind: 'body';
  source: string[];
  cacheId: string | null;
}

export type TreeNote = OutlineNote | Body;

export interface Document {
  id: string | null;
  children: TreeNote[];
}
