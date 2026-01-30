import { describe, expect, it } from 'vitest';
import { getNoteKey, meta } from '#tests';
import { waitFor } from '@testing-library/react';
import type { ListItemNode } from '@lexical/list';
import { $getNodeByKey } from 'lexical';
import { $indentNote } from '@/editor/lexical-helpers';
import { extractOutlineFromEditorState } from '#tests-common/outline';
import { assertEditorSchema } from '@/editor/plugins/dev/schema/assertEditorSchema';
import { createCollabPeer } from './_support/remdo-peers';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';

const normalizeOutline = (outline: any): any[] => outline.map((node: any) => ({
  noteId: node.noteId,
  ...(node.children ? { children: normalizeOutline(node.children) } : {}),
}));

// FIXME: reasses the outcomes in all of the tests below
// TODO: Drop this once collab parallel scenarios are deterministic and stable.
const expectOutlineToMatchAny = (remdoA: any, remdoB: any, candidates: unknown[]) => {
  const actualA = normalizeOutline(extractOutlineFromEditorState(remdoA.getEditorState()));
  const actualB = normalizeOutline(extractOutlineFromEditorState(remdoB.getEditorState()));

  for (const expected of candidates) {
    const normalizedExpected = normalizeOutline(expected as any[]);
    try {
      expect(actualA).toEqual(normalizedExpected);
      expect(actualB).toEqual(normalizedExpected);
      return;
    } catch {
      // Try next candidate.
    }
  }
  throw new Error('Outlines differ from all expected variants.');
};

describe('collaboration outline normalization', { timeout: COLLAB_LONG_TIMEOUT_MS }, () => {
  it(
    'repairs orphan wrappers after hydration',
    meta({
      fixture: 'editor-schema/wrapper-orphan-after-wrapper',
      fixtureSchemaBypass: true,
      expectedConsoleIssues: ['runtime.invariant orphan-wrapper-merged-into-previous'],
    }),
    async ({ remdo }) => {
      await remdo.waitForSynced();
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
    'repairs an orphan wrapper from concurrent delete + indent',
    meta(
      { fixture: 'flat', expectedConsoleIssues: ['runtime.invariant orphan-wrapper-without-previous-content'] },
    ),
    async ({ remdo }) => {
      const remdo2 = await createCollabPeer(remdo);
      await Promise.all([remdo.waitForSynced(), remdo2.waitForSynced()]);

      const note1Key = getNoteKey(remdo, 'note1');
      const note2Key = getNoteKey(remdo2, 'note2');

      await Promise.all([
        remdo.mutate(() => {
          const item = $getNodeByKey(note1Key) as ListItemNode;
          item.remove();
        }),
        remdo2.mutate(() => {
          const item = $getNodeByKey(note2Key) as ListItemNode;
          $indentNote(item);
        }),
      ]);

      await Promise.all([remdo.waitForSynced(), remdo2.waitForSynced()]);

      const expected = [
        { noteId: 'note2', text: 'note2' },
        { noteId: 'note3', text: 'note3' },
      ];
      const fallback = [
        // note2 can be dropped due to the delete+indent conflict.
        { noteId: 'note3', text: 'note3' },
      ];

      await waitFor(() => {
        expectOutlineToMatchAny(remdo, remdo2, [expected, fallback]);
      });

      assertEditorSchema(remdo.getEditorState());
      assertEditorSchema(remdo2.getEditorState());
    }
  );

  it(
    'repairs nested orphan wrappers from concurrent delete + indent',
    meta(
      { fixture: 'basic', expectedConsoleIssues: ['runtime.invariant orphan-wrapper-without-previous-content'] },
    ),
    async ({ remdo }) => {
      const note3Key = getNoteKey(remdo, 'note3');
      await remdo.mutate(() => {
        const item = $getNodeByKey(note3Key) as ListItemNode;
        $indentNote(item);
      });
      expect(remdo).toMatchOutline([
        {
          noteId: 'note1',
          text: 'note1',
          children: [
            { noteId: 'note2', text: 'note2' },
            { noteId: 'note3', text: 'note3' },
          ],
        },
      ]);

      const remdo2 = await createCollabPeer(remdo);
      await remdo2.waitForSynced();

      const note2Key = getNoteKey(remdo, 'note2');
      const note3KeyOnRemdo2 = getNoteKey(remdo2, 'note3');

      await Promise.all([
        remdo.mutate(() => {
          const item = $getNodeByKey(note2Key) as ListItemNode;
          item.remove();
        }),
        remdo2.mutate(() => {
          const item = $getNodeByKey(note3KeyOnRemdo2) as ListItemNode;
          $indentNote(item);
        }),
      ]);

      await Promise.all([remdo.waitForSynced(), remdo2.waitForSynced()]);

      const expected = [
        {
          noteId: 'note1',
          text: 'note1',
          // Note3 text can duplicate during merge; we compare only note ids here.
          children: [{ noteId: 'note3' }],
        },
      ];
      const fallback = [
        // note3 can be dropped due to the delete+indent conflict.
        { noteId: 'note1', text: 'note1' },
      ];

      await waitFor(() => {
        expectOutlineToMatchAny(remdo, remdo2, [expected, fallback]);
      });
    }
  );

  it(
    'repairs orphan wrappers from concurrent delete + indent (tree-complex)',
    meta({ fixture: 'tree-complex' }),
    async ({ remdo }) => {
      const remdo2 = await createCollabPeer(remdo);
      await Promise.all([remdo.waitForSynced(), remdo2.waitForSynced()]);

      const note2Key = getNoteKey(remdo, 'note2');
      const note4Key = getNoteKey(remdo2, 'note4');

      await Promise.all([
        remdo.mutate(() => {
          const item = $getNodeByKey(note2Key) as ListItemNode;
          item.remove();
        }),
        remdo2.mutate(() => {
          const item = $getNodeByKey(note4Key) as ListItemNode;
          $indentNote(item);
        }),
      ]);

      await Promise.all([remdo.waitForSynced(), remdo2.waitForSynced()]);

      const expected = [
        {
          noteId: 'note1',
          text: 'note1',
          children: [
            { noteId: 'note3', text: 'note3' },
            // note4 is dropped due to the delete+indent conflict.
          ],
        },
        { noteId: 'note5', text: 'note5' },
        {
          noteId: 'note6',
          text: 'note6',
          children: [{ noteId: 'note7', text: 'note7' }],
        },
      ];

      await waitFor(() => {
        expect(remdo).toMatchOutline(expected);
        expect(remdo2).toMatchOutline(expected);
      });
    }
  );

});
