import { describe, expect, it } from 'vitest';
import { waitFor } from '@testing-library/react';

import type { ListItemNode } from '@lexical/list';
import { $getNodeByKey } from 'lexical';

import { pressKey, readOutline, getNoteKey, placeCaretAtNote, meta } from '#tests';
import type { RemdoTestApi } from '#client/editor/plugins/dev';
import { removeNoteSubtree } from '#client/editor/outline/selection/tree';
import { flattenOutline } from '#tests-common/outline';
import { createCollabPeer } from './_support/remdo-peers';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';

// Collect the note ids present in an outline, in document order.
function noteIds(remdo: RemdoTestApi): string[] {
  return flattenOutline(readOutline(remdo)).flatMap((node) => (node.noteId ? [node.noteId] : []));
}

// Remove a note (and its subtree) directly in the model — a deterministic stand-in
// for a remote collaborator deleting the note.
async function removeNote(remdo: RemdoTestApi, noteId: string): Promise<void> {
  const key = getNoteKey(remdo, noteId);
  await remdo.mutate(() => {
    const item = $getNodeByKey<ListItemNode>(key)!;
    removeNoteSubtree(item);
  });
}

// Build a structural selection over note2's subtree (anchor note2 → note2,
// note3) by climbing the Shift+Arrow ladder: inline, then subtree.
async function selectNote2Subtree(remdo: RemdoTestApi): Promise<void> {
  await placeCaretAtNote(remdo, 'note2');
  await pressKey(remdo, { key: 'ArrowDown', shift: true });
  await pressKey(remdo, { key: 'ArrowDown', shift: true });
  await waitFor(() => {
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });
  });
}

describe('collab selection reshape via replay', { timeout: COLLAB_LONG_TIMEOUT_MS }, () => {
  it("tier 1/2: grows the structural selection to include a remotely-added descendant", meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    const secondary = await createCollabPeer(remdo);
    expect(readOutline(secondary)).toEqual(readOutline(remdo));

    // On A: structural selection over note2's subtree (anchor note2 → note2, note3).
    await selectNote2Subtree(remdo);

    // On B: add a new child note under note3 (Enter at end of note3 makes a
    // sibling, Tab indents it to become note3's child).
    const idsBefore = new Set(noteIds(secondary));
    await placeCaretAtNote(secondary, 'note3', Number.POSITIVE_INFINITY);
    await pressKey(secondary, { key: 'Enter' });
    await pressKey(secondary, { key: 'Tab' });

    await waitFor(() => {
      expect(readOutline(remdo)).toEqual(readOutline(secondary));
    });

    const newId = noteIds(secondary).find((id) => !idsBefore.has(id));
    expect(newId).toBeDefined();

    // A's structural selection auto-reshapes to cover note2's grown subtree,
    // now including the remotely-added descendant.
    await waitFor(() => {
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', newId!] });
    });
  });

  it("tier 3: truncates to the still-valid prefix when a swept sibling is deleted", meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    const secondary = await createCollabPeer(remdo);
    expect(readOutline(secondary)).toEqual(readOutline(remdo));

    // On A: structural selection sweeping the last root note5 down into the
    // final root sibling note6 (anchor note5 → note5, note6, note7). Climb the
    // ladder: inline, subtree, sibling-down. The terminal sibling rung resolves
    // only because note6 follows note5 at the root level.
    await placeCaretAtNote(remdo, 'note5');
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await waitFor(() => {
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note5', 'note6', 'note7'] });
    });

    // On B: delete note6 (and its subtree) — the swept sibling. note5 becomes
    // the last root note, so the terminal sibling rung can no longer resolve.
    await removeNote(secondary, 'note6');

    await waitFor(() => {
      expect(readOutline(remdo)).toEqual(readOutline(secondary));
      expect(noteIds(remdo)).not.toContain('note6');
    });

    // A's selection truncates to the still-valid prefix (anchor note5's subtree).
    await waitFor(() => {
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note5'] });
    });
  });

  it("tier 1: hoists instead of truncating when a deleted swept sibling can still hoist", meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    const secondary = await createCollabPeer(remdo);
    expect(readOutline(secondary)).toEqual(readOutline(remdo));

    // On A: anchor note2 subtree, then sweep down to sibling note4
    // (anchor note2 → note2, note3, note4).
    await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await waitFor(() => {
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });
    });

    // On B: delete the swept sibling note4. note2 still has a parent (note1) to
    // hoist into, so the sibling rung resolves by hoisting rather than truncating.
    await removeNote(secondary, 'note4');

    await waitFor(() => {
      expect(readOutline(remdo)).toEqual(readOutline(secondary));
      expect(noteIds(remdo)).not.toContain('note4');
    });

    // A's selection reshapes (tier 1) to the hoisted parent subtree, not a
    // truncation back to the anchor.
    await waitFor(() => {
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3'] });
    });
  });

  it("tier 4: collapses to a caret when the anchor note is deleted", meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    const secondary = await createCollabPeer(remdo);
    expect(readOutline(secondary)).toEqual(readOutline(remdo));

    // On A: structural selection anchored on note2 (covers note2, note3).
    await selectNote2Subtree(remdo);

    // On B: delete note2 and its subtree.
    await removeNote(secondary, 'note2');

    await waitFor(() => {
      expect(readOutline(remdo)).toEqual(readOutline(secondary));
      expect(noteIds(remdo)).not.toContain('note2');
      expect(noteIds(remdo)).not.toContain('note3');
    });

    // A no longer has a structural selection; it collapsed to a caret.
    await waitFor(() => {
      expect(remdo.editor.selection.isStructural()).toBe(false);
    });
  });
});
