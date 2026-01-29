import type { SerializedEditorState } from 'lexical';
import { describe, expect, it } from 'vitest';
import { meta } from '#tests';
import { assertEditorSchema } from '@/editor/plugins/dev/schema/assertEditorSchema';
import duplicateNoteId from '#fixtures/editor-schema/duplicate-note-id.json';
import emptyText from '#fixtures/editor-schema/empty-text.json';
import indentJump from '#fixtures/editor-schema/indent-jump.json';
import listWrapperNoListitem from '#fixtures/editor-schema/list-wrapper-no-listitem.json';
import missingNoteId from '#fixtures/editor-schema/missing-note-id.json';
import minimalValid from '#fixtures/editor-schema/minimal-valid.json';
import wrapperOrphan from '#fixtures/editor-schema/wrapper-orphan.json';
import wrapperOrphanAfterWrapper from '#fixtures/editor-schema/wrapper-orphan-after-wrapper.json';
import wrapperWithoutSibling from '#fixtures/editor-schema/wrapper-without-sibling.json';

describe('assertEditorSchema', () => {
  const cast = (data: unknown) => data as SerializedEditorState;

  it('accepts a minimal valid outline', () => {
    expect(() => assertEditorSchema(cast(minimalValid))).not.toThrow();
  });

  it(
    'reports when a content item is missing a noteId',
    meta({ expectedConsoleIssues: ['runtime.invariant missing-note-id path=0 noteId=undefined'] }),
    () => {
      assertEditorSchema(cast(missingNoteId));
    }
  );

  it(
    'reports when noteIds are duplicated',
    meta({ expectedConsoleIssues: ['runtime.invariant duplicate-note-id path=1 noteId=duplicated'] }),
    () => {
      assertEditorSchema(cast(duplicateNoteId));
    }
  );

  it(
    'reports for wrapper list item without preceding sibling',
    meta({ expectedConsoleIssues: ['runtime.invariant wrapper-without-sibling path=root'] }),
    () => {
      assertEditorSchema(cast(wrapperWithoutSibling));
    }
  );

  it(
    'reports for wrapper list item at list start',
    meta({ expectedConsoleIssues: ['runtime.invariant wrapper-without-sibling path=root'] }),
    () => {
      assertEditorSchema(cast(wrapperOrphan));
    }
  );

  it(
    'reports for wrapper list item after another wrapper',
    meta({ expectedConsoleIssues: ['runtime.invariant wrapper-without-sibling path=root'] }),
    () => {
      assertEditorSchema(cast(wrapperOrphanAfterWrapper));
    }
  );

  it(
    'reports when a nested list lacks list item children',
    meta({ expectedConsoleIssues: ['runtime.invariant list-wrapper-no-listitem path=0'] }),
    () => {
      assertEditorSchema(cast(listWrapperNoListitem));
    }
  );

  it(
    'reports on indent jumps greater than one level',
    meta({ expectedConsoleIssues: ['runtime.invariant indent-jump path=1 parentIndent=0 entryIndent=2'] }),
    () => {
      assertEditorSchema(cast(indentJump));
    }
  );

  it('ignores list items with empty text content', () => {
    expect(() => assertEditorSchema(cast(emptyText))).not.toThrow();
  });
});
