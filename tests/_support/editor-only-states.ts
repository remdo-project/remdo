import type { SerializedEditorState, SerializedLexicalNode } from 'lexical';

import { transformSerializedEditorState } from '#client/editor/runtime/serialized-editor-state';
import { restoreEditorStateDefaults } from '#tools/editor-state-defaults';
import { buildFixtureState } from './markdown-fixture';

interface SerializedNote extends SerializedLexicalNode {
  noteId?: string;
  children?: SerializedLexicalNode[];
  [key: string]: unknown;
}

type NoteEdit = (note: SerializedNote) => SerializedLexicalNode | SerializedLexicalNode[];

/**
 * Editor states test documents can't hold, for tests of schema checks and load-time repair. Each is a
 * test document with edits applied.
 */
export const editorOnlyStates = {
  missingNoteId: () => editNotes(buildFixtureState('- note1'), {
    note1: ({ noteId, ...note }) => note,
  }),
  duplicateNoteId: () => editNotes(buildFixtureState('- note1\n    - id:: duplicated\n- note2'), {
    note2: (note) => ({ ...note, noteId: 'duplicated' }),
  }),
  emptyTextNode: () => editNotes(buildFixtureState('-\n    - id:: empty'), {
    empty: (note) => ({ ...note, children: [{ type: 'text', text: '' }] }),
  }),
  indentJump: () => editNotes(buildFixtureState('- note1\n- note2'), { note2: (note) => ({ ...note, indent: 2 }) }),
  childListWithoutListItem: () => editNotes(buildFixtureState('- note1\n    - note2'), { note2: (note) => note.children! }),
  wrapperWithoutPreviousNote: () => editNotes(
    buildFixtureState('- orphaning\n    - note1-child-of-orphaned-wrapper\n        - id:: note1\n- note3-root-2nd-child\n    - id:: note3'),
    { orphaning: () => [] },
  ),
  wrapperAfterWrapper: () => editNotes(
    buildFixtureState(
      '- note1\n    - note2-valid-child\n        - id:: note2\n- orphaning\n    - note3-child-of-orphaned-wrapper\n        - id:: note3',
    ),
    { orphaning: () => [] },
  ),
  /** An orphaned wrapper whose repair hoists children into another orphaned wrapper. */
  nestedOrphanWrappers: () => editNotes(
    buildFixtureState('- orphaning\n    - note1\n        - note2\n    - nestedOrphaning\n        - note3\n- note4'),
    { orphaning: () => [], nestedOrphaning: () => [] },
  ),
  onlyAWrapper: () => editNotes(buildFixtureState('- orphaning\n    - note1'), { orphaning: () => [] }),
};

/**
 * Replaces each named note's list item with what its edit returns, in place among its siblings, then fills in
 * the Lexical defaults the edits leave out.
 */
export function editNotes(state: SerializedEditorState, edits: Record<string, NoteEdit>): SerializedEditorState {
  const edited = new Set<string>();
  const result = transformSerializedEditorState(state, (node) => {
    const { children } = node as SerializedNote;
    if (!children) return node;
    const withEdits: SerializedNote = {
      ...node,
      children: children.flatMap((child) => {
        const { noteId } = child as SerializedNote;
        if (child.type !== 'listitem' || noteId === undefined || !Object.hasOwn(edits, noteId)) return [child];
        edited.add(noteId);
        return edits[noteId]!(child);
      }),
    };
    return withEdits;
  });
  const missing = Object.keys(edits).filter((noteId) => !edited.has(noteId));
  if (missing.length > 0) throw new Error(`No note ${missing.join(', ')} to edit.`);
  return restoreEditorStateDefaults(result);
}
