import type { SerializedLexicalNode } from 'lexical';
import { act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { editNotes, editorOnlyStates } from '#tests-common/editor-only-states';
import { meta } from '#tests';
import { assertEditorSchema } from '#client/editor/dev/schema/assertEditorSchema';
import { buildFixtureState } from '#tests-common/markdown-fixture';

describe('assertEditorSchema', () => {
  const minimalValid = () => buildFixtureState('- note1');

  it('accepts a minimal valid outline', () => {
    expect(() => assertEditorSchema(minimalValid())).not.toThrow();
  });

  const stateWithContent = (content: SerializedLexicalNode[]) =>
    editNotes(minimalValid(), { note1: (note) => ({ ...note, children: content }) });

  const lineBreak = { type: 'linebreak', version: 1 };
  const link = { type: 'link', version: 1, children: [lineBreak] };

  it.each([
    ['directly', lineBreak],
    ['inside a link', link],
    ['inside text', { type: 'text', version: 1, text: 'one\ntwo' }],
    ['as a carriage return', { type: 'text', version: 1, text: 'one\rtwo' }],
  ])(
    'reports a line break %s in note content',
    meta({ expectedConsoleIssues: ['runtime.invariant content-line-break path=0'] }),
    (_location, node) => {
      assertEditorSchema(stateWithContent([node]));
    }
  );

  it('accepts line breaks in a body', () => {
    const bodyWrapper = {
      type: 'note-body-wrapper', version: 1,
      children: [{ type: 'note-body', version: 1, children: [lineBreak, link] }],
    };
    assertEditorSchema(editNotes(minimalValid(), { note1: (note) => [note, bodyWrapper] }));
  });

  it(
    'reports content line breaks through the editor test API',
    meta({ expectedConsoleIssues: ['runtime.invariant content-line-break path=0'] }),
    async ({ remdo }) => {
      act(() => {
        remdo.editor.setEditorState(remdo.editor.parseEditorState(stateWithContent([lineBreak])));
      });
      await remdo.waitForSynced();
    }
  );

  it(
    'reports when a content item is missing a noteId',
    meta({ expectedConsoleIssues: ['runtime.invariant missing-note-id path=0 noteId=undefined'] }),
    () => {
      assertEditorSchema(editorOnlyStates.missingNoteId());
    }
  );

  it(
    'reports when noteIds are duplicated',
    meta({ expectedConsoleIssues: ['runtime.invariant duplicate-note-id path=1 noteId=duplicated'] }),
    () => {
      assertEditorSchema(editorOnlyStates.duplicateNoteId());
    }
  );

  it(
    'reports for wrapper list item without preceding sibling',
    meta({ expectedConsoleIssues: ['runtime.invariant wrapper-without-sibling path=root'] }),
    () => {
      assertEditorSchema(editorOnlyStates.onlyAWrapper());
    }
  );

  it(
    'reports for wrapper list item at list start',
    meta({ expectedConsoleIssues: ['runtime.invariant wrapper-without-sibling path=root'] }),
    () => {
      assertEditorSchema(editorOnlyStates.wrapperWithoutPreviousNote());
    }
  );

  it(
    'reports for wrapper list item after another wrapper',
    meta({ expectedConsoleIssues: ['runtime.invariant wrapper-without-sibling path=root'] }),
    () => {
      assertEditorSchema(editorOnlyStates.wrapperAfterWrapper());
    }
  );

  it(
    'reports when a nested list lacks list item children',
    meta({ expectedConsoleIssues: ['runtime.invariant list-wrapper-no-listitem path=0'] }),
    () => {
      assertEditorSchema(editorOnlyStates.childListWithoutListItem());
    }
  );

  it(
    'reports on indent jumps greater than one level',
    meta({ expectedConsoleIssues: ['runtime.invariant indent-jump path=1 parentIndent=0 entryIndent=2'] }),
    () => {
      assertEditorSchema(editorOnlyStates.indentJump());
    }
  );

  it('ignores list items with empty text content', () => {
    expect(() => assertEditorSchema(editorOnlyStates.emptyTextNode())).not.toThrow();
  });
});
