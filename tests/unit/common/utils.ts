import { Note } from '@/components/Editor/plugins/remdo/utils/api';
import { $getRoot, LexicalEditor } from 'lexical';

/** put children at the end */
export function lexicalStateKeyCompare(a: any, b: any) {
  if (a === 'children') {
    return 1;
  }
  if (b === 'children') {
    return -1;
  }
  return a.localeCompare(b);
}

/**
 * converts editor state to YAML with removed defaults for easier reading and
 * comparison, used for saving snapshots
 */
export function getMinimizedState(editor: LexicalEditor) {
  type Node = Array<Node> | object;
  const SKIP = null; //marker in default table that means that the particular key should be skipped regardless of the value

  function walk(node: Node) {
    function minimize(node: object) {
      const defaults = {
        list: {
          direction: 'ltr',
          format: '',
          indent: 0,
          listType: 'bullet',
          start: 1,
          tag: 'ul',
          version: 1,
        },
        listitem: {
          direction: 'ltr',
          format: '',
          indent: 0,
          version: 1,
          checked: false,
          folded: false,
          value: SKIP,
          id: SKIP,
        },
        text: {
          detail: 0,
          format: 0,
          mode: 'normal',
          style: '',
          text: '',
          version: 1,
        },
        undefined: {},
        root: {
          direction: 'ltr',
          format: '',
          indent: 0,
          version: 1,
        },
      };

      const d = defaults[node['type']];
      if (!d) {
        throw new Error('No defaults for ' + node['type']);
      }
      for (const key in node) {
        if (node[key] === null || node[key] === d[key] || d[key] === SKIP) {
          delete node[key];
        }
      }
    }

    if (
      ['number', 'string', 'boolean'].includes(typeof node) ||
      node === null
    ) {
      return;
    } else if (node instanceof Array) {
      for (let i = 0; i < node.length; i++) {
        walk(node[i]);
      }
    } else if (node instanceof Object) {
      minimize(node);
      for (const key in node) {
        walk(node[key]);
      }
    } else {
      throw new Error(`Unexpected node: ${node} type: ${typeof node}`);
    }
  }
  const editorState = editor.getEditorState();
  const state = JSON.parse(JSON.stringify(editorState)); // clone deeply
  walk(state);

  return state;
}

export function createChildren(
  note: Note,
  count: number,
): [Array<Note>, ...Note[]] {
  const start = [...note.children].length;
  for (let i = 0; i < count; ++i) {
    note.createChild(`note${start + i}`);
  }
  const n: Array<Note> = [note, ...note.children];
  const n1: Array<Note> = [...note.children];

  return [n, ...n1];
}

export function getVisibleNotes(queries: Queries) {
  return queries
    .getAllByRole("generic")
    .filter(el => el.tagName.toLowerCase() === "span")
    .map(el => el.textContent);
}

export function getNotes(editor: LexicalEditor): Record<string, Note> {
  type Notes = Record<string, Note>;

  function toCamelCase(str: string): string {
    return str
      .trim()
      .toLowerCase()
      .replace(/(\s+)(\w)/g, (_, __, letter) => letter.toUpperCase());
  }

  function walk(note: Note, notes: Notes) {
    notes[toCamelCase(note.text)] = note;
    for (const child of note.children) {
      walk(child, notes);
    }
  }

  const notes: Notes = {};
  editor.update(() => {
    walk(Note.from($getRoot()), notes);
  });
  return notes;
}

