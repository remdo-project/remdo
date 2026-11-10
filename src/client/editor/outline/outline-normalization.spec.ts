import { act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ListItemNode, ListNode } from '@lexical/list';
import { $getRoot, ParagraphNode, TextNode } from 'lexical';
import { readFixture } from '#tools/fixtures';
import { createMountedLexicalEditor, meta, placeCaretAtNote } from '#tests';
import { REORDER_NOTES_UP_COMMAND } from '#client/editor/foundation/commands';
import { $normalizeOutlineRoot, $shouldNormalizeOutlineRoot } from '#client/editor/outline/normalization';

describe('outline normalization on load', () => {
  it(
    'repairs a root-level orphan wrapper by hoisting its children',
    meta({
      fixture: 'editor-schema/wrapper-orphan',
      fixtureSchemaBypass: true,
    }),
    async ({ remdo }) => {
      expect(remdo).toMatchOutline(`
        - note1-child-of-orphaned-wrapper
            - id:: note1
        - note3-root-2nd-child
            - id:: note3
      `);
    }
  );

  it(
    'repairs an orphan wrapper after another wrapper by merging into the previous note',
    meta({
      fixture: 'editor-schema/wrapper-orphan-after-wrapper',
      fixtureSchemaBypass: true,
      expectedConsoleIssues: ['runtime.invariant orphan-wrapper-merged-into-previous'],
    }),
    async ({ remdo }) => {
      expect(remdo).toMatchOutline(`
        - note1
            - note2-valid-child
                - id:: note2
            - note3-child-of-orphaned-wrapper
                - id:: note3
      `);
    }
  );

  it(
    'enables move-up after repairing an orphan wrapper',
    meta({
      fixture: 'editor-schema/wrapper-orphan',
      fixtureSchemaBypass: true,
    }),
    async ({ remdo }) => {
      await placeCaretAtNote(remdo, { id: 'note3' });
      await remdo.dispatchCommand(REORDER_NOTES_UP_COMMAND);
      expect(remdo).toMatchOutline(`
        - note3-root-2nd-child
            - id:: note3
        - note1-child-of-orphaned-wrapper
            - id:: note1
      `);
    }
  );

});

describe('outline normalization (single pass)', () => {
  it(
    'resolves orphan wrappers created by hoisting in one normalization pass',
    meta({
      expectedConsoleIssues: [
        'runtime.invariant orphan-wrapper-without-previous-content',
        'runtime.invariant orphan-wrapper-merged-into-previous',
      ],
    }),
    async () => {
    const fixture = await readFixture('editor-schema/wrapper-orphan-nested-wrapper');
    const { editor, dispose } = createMountedLexicalEditor({
      namespace: 'outline-normalization-single-pass',
      nodes: [ListNode, ListItemNode, ParagraphNode, TextNode],
    });

    await act(async () => {
      const parsed = editor.parseEditorState(JSON.parse(fixture));
      editor.setEditorState(parsed);
    });

    await act(async () => {
      editor.update(() => {
        $normalizeOutlineRoot($getRoot());
      });
    });

    const needsRepair = editor.getEditorState().read(() => $shouldNormalizeOutlineRoot($getRoot()));
    dispose();

      expect(needsRepair).toBe(false);
    }
  );
});
