import type { SerializedEditorState } from 'lexical';

import { buildFixtureState } from './markdown-fixture';

interface SerializedNode {
  type: string;
  noteId?: string;
  children?: SerializedNode[];
  [key: string]: unknown;
}

/**
 * Editor states that test documents can't hold, for tests of schema checks and load-time repair. Each
 * is a test document with one breakage applied.
 */
export const brokenEditorStates = {
  missingNoteId: () => editNote(buildFixtureState('- note1'), 'note1', (note) => {
    delete note.noteId;
  }),
  duplicateNoteId: () => editNote(buildFixtureState('- note1\n    - id:: duplicated\n- note2'), 'note2', (note) => {
    note.noteId = 'duplicated';
  }),
  emptyTextNode: () => editNote(buildFixtureState('-\n    - id:: empty'), 'empty', (note) => {
    note.children = [{ type: 'text', text: '', detail: 0, format: 0, mode: 'normal', style: '', version: 1 }];
  }),
  indentJump: () => editNote(buildFixtureState('- note1\n- note2'), 'note2', (note) => {
    note.indent = 2;
  }),
  childListWithoutListItem: () => editNote(buildFixtureState('- note1\n    - note2'), 'note2', (note, siblings) => {
    siblings.splice(siblings.indexOf(note), 1, ...note.children!);
  }),
  /** A children wrapper first in the document, with no note before it. */
  wrapperWithoutPreviousNote: () => withoutNotes(
    buildFixtureState('- orphaning\n    - note1-child-of-orphaned-wrapper\n        - id:: note1\n- note3-root-2nd-child\n    - id:: note3'),
    'orphaning',
  ),
  /** A children wrapper right after another note's children wrapper. */
  wrapperAfterWrapper: () => withoutNotes(
    buildFixtureState(
      '- note1\n    - note2-valid-child\n        - id:: note2\n- orphaning\n    - note3-child-of-orphaned-wrapper\n        - id:: note3',
    ),
    'orphaning',
  ),
  /** An orphaned wrapper whose repair hoists children into another orphaned wrapper. */
  nestedOrphanWrappers: () => withoutNotes(
    buildFixtureState('- orphaning\n    - note1\n        - note2\n    - nestedOrphaning\n        - note3\n- note4'),
    'orphaning',
    'nestedOrphaning',
  ),
  /** A document whose only list item is a children wrapper. */
  onlyAWrapper: () => withoutNotes(buildFixtureState('- orphaning\n    - note1'), 'orphaning'),
};

function editNote(
  state: SerializedEditorState,
  noteId: string,
  edit: (note: SerializedNode, siblings: SerializedNode[]) => void,
): SerializedEditorState {
  const walk = (siblings: SerializedNode[]): boolean => siblings.some((node) => {
    if (node.type === 'listitem' && node.noteId === noteId) {
      edit(node, siblings);
      return true;
    }
    return walk(node.children ?? []);
  });
  if (!walk([state.root])) throw new Error(`No note ${noteId} to break.`);
  return state;
}

function withoutNotes(state: SerializedEditorState, ...noteIds: string[]): SerializedEditorState {
  for (const noteId of noteIds) editNote(state, noteId, (note, siblings) => siblings.splice(siblings.indexOf(note), 1));
  return state;
}
