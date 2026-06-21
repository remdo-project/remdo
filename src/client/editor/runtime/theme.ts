import type { EditorThemeClasses } from 'lexical';

export const editorTheme: EditorThemeClasses = {
  // `remdo-outline` carries the shared list/marker rendering (bullets, checkboxes,
  // ordered counters); `editor-root` adds editor-only chrome and interaction state.
  root: 'editor-root remdo-outline',
  paragraph: 'editor-paragraph',
  link: 'text-link',
  text: {
    bold: 'text-bold',
    italic: 'text-italic',
    underline: 'text-underline',
    code: 'text-code',
  },
  list: {
    ul: 'list-ul',
    ol: 'list-ol',
    listitem: 'list-item',
    listitemChecked: 'list-item-checked',
    listitemUnchecked: 'list-item-unchecked',
    nested: {
      list: 'list-nested',
      listitem: 'list-nested-item',
    },
  },
};
