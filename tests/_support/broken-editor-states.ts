import { buildFixtureState, editNotes } from './markdown-fixture';

/**
 * Invalid editor states, which test documents can't hold, shared by schema-check and load-time repair
 * tests: the shapes older saves, imports, other writers or merged concurrent edits can hand the
 * editor. Each is a test document with edits applied.
 */
export const brokenEditorStates = {
  missingNoteId: () => editNotes(buildFixtureState('- note1'), {
    note1: ({ noteId, ...note }) => note,
  }),
  duplicateNoteId: () => editNotes(buildFixtureState('- note1\n    - id:: duplicated\n- note2'), {
    note2: (note) => ({ ...note, noteId: 'duplicated' }),
  }),
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
};
