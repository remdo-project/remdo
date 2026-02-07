import type { EditorThemeClasses } from 'lexical';

export const editorTheme: EditorThemeClasses = {
  root: 'editor-root',
  paragraph: 'editor-paragraph',
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
