import { $createTextNode, $getNodeByKey, $isTextNode } from 'lexical';
import { describe, expect, it } from 'vitest';

import { $findNoteById } from '#client/editor/outline/note-traversal';
import { meta } from '#tests';
import { $openTriggerSession, $resolvePinnedSession } from './session';

// Pinned-session resolution (docs/outliner/popups.md): an open session is
// re-resolved against its origin span only and never retargets onto a different
// trigger. These exercise the resolver directly because the failure mode — the
// caret moving back beside an earlier trigger while a picker is open — cannot be
// simulated with synthetic key events in jsdom (no native caret movement); the
// live caret walk is covered by an e2e test.
describe('trigger session resolution', () => {
  it('re-resolves an open session against its pinned span while the caret stays in it', meta({ fixture: 'flat' }), async ({ remdo }) => {
    let result: unknown;
    await remdo.mutate(() => {
      const note = $findNoteById('note1')!;
      note.clear();
      const node = $createTextNode('@ali');
      note.append(node);
      const live = $getNodeByKey(node.getKey());
      // session pinned to the @ at offset 0; caret at end of "@ali" (offset 4).
      result = $isTextNode(live)
        ? $resolvePinnedSession('@', live, 4, { textNodeKey: node.getKey(), triggerOffset: 0 })?.query
        : 'no-text';
    });
    expect(result).toBe('ali');
  });

  it('closes an open session instead of retargeting onto an earlier trigger', meta({ fixture: 'flat' }), async ({ remdo }) => {
    let result: unknown;
    await remdo.mutate(() => {
      const note = $findNoteById('note1')!;
      note.clear();
      const node = $createTextNode('@old @new');
      note.append(node);
      const live = $getNodeByKey(node.getKey());
      // session pinned to the LATER @ (offset 5); caret moved back to after the
      // EARLIER @ (offset 1). Must close (null), not re-home onto offset 0.
      result = $isTextNode(live)
        ? $resolvePinnedSession('@', live, 1, { textNodeKey: node.getKey(), triggerOffset: 5 })
        : 'no-text';
    });
    expect(result).toBeNull();
  });

  it('closes rather than re-homing when the pinned node is gone', meta({ fixture: 'flat' }), async ({ remdo }) => {
    // If the pinned trigger's node key no longer resolves (a split/merge rotated
    // it), the session closes instead of scanning back — which could otherwise
    // latch onto an earlier trigger. Passing a stale key models the node-gone case.
    let result: unknown;
    await remdo.mutate(() => {
      const note = $findNoteById('note1')!;
      note.clear();
      note.append($createTextNode('@old @new'));
      const anchor = note.getFirstChild();
      result = $isTextNode(anchor)
        ? $resolvePinnedSession('@', anchor, 9, { textNodeKey: 'stale-missing-key', triggerOffset: 5 })
        : 'no-text';
    });
    expect(result).toBeNull();
  });

  it('opens a fresh session by scanning to the just-typed trigger', meta({ fixture: 'flat' }), async ({ remdo }) => {
    let result: unknown;
    await remdo.mutate(() => {
      const note = $findNoteById('note1')!;
      note.clear();
      const node = $createTextNode('hi @');
      note.append(node);
      const live = $getNodeByKey(node.getKey());
      // fresh open: caret just after the @ at offset 3, query empty.
      const resolved = $isTextNode(live) ? $openTriggerSession('@', live, 4) : null;
      result = resolved ? { off: resolved.session.triggerOffset, q: resolved.query } : 'null';
    });
    expect(result).toEqual({ off: 3, q: '' });
  });
});
