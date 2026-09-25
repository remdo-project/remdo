import type { OutlineSelectionApi } from '#client/editor/outline/selection/store';

declare module 'lexical' {
  interface LexicalEditor {
    selection: OutlineSelectionApi;
  }
}
