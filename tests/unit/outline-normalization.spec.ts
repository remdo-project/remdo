import { act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ListItemNode, ListNode } from '@lexical/list';
import { $getRoot, ParagraphNode, TextNode, createEditor } from 'lexical';
import { readFixture } from '#tests-common/fixtures';
import { meta, placeCaretAtNote } from '#tests';
import { REORDER_NOTES_UP_COMMAND } from '@/editor/commands';
import { $normalizeOutlineRoot, $shouldNormalizeOutlineRoot } from '@/editor/outline/normalization';

describe('outline normalization on load', () => {
  it(
    'repairs a root-level orphan wrapper by hoisting its children',
    meta({
      fixture: 'editor-schema/wrapper-orphan',
      fixtureSchemaBypass: true,
      expectedConsoleIssues: ['runtime.invariant orphan-wrapper-without-previous-content'],
    }),
    async ({ remdo }) => {
      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'note1-child-of-orphaned-wrapper' },
        { noteId: 'note3', text: 'note3-root-2nd-child' },
      ]);
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
      expect(remdo).toMatchOutline([
        {
          noteId: 'note1',
          text: 'note1',
          children: [
            { noteId: 'note2', text: 'note2-valid-child' },
            { noteId: 'note3', text: 'note3-child-of-orphaned-wrapper' },
          ],
        },
      ]);
    }
  );

  it(
    'enables move-up after repairing an orphan wrapper',
    meta({
      fixture: 'editor-schema/wrapper-orphan',
      fixtureSchemaBypass: true,
      expectedConsoleIssues: ['runtime.invariant orphan-wrapper-without-previous-content'],
    }),
    async ({ remdo }) => {
      await placeCaretAtNote(remdo, 'note3');
      await remdo.dispatchCommand(REORDER_NOTES_UP_COMMAND);
      expect(remdo).toMatchOutline([
        { noteId: 'note3', text: 'note3-root-2nd-child' },
        { noteId: 'note1', text: 'note1-child-of-orphaned-wrapper' },
      ]);
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
    const root = document.createElement('div');
    document.body.append(root);

    const editor = createEditor({
      namespace: 'outline-normalization-single-pass',
      nodes: [ListNode, ListItemNode, ParagraphNode, TextNode],
    });
    editor.setRootElement(root);

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
    root.remove();

      expect(needsRepair).toBe(false);
    }
  );
});
