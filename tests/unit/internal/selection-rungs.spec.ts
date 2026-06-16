import { $createListItemNode, $createListNode, ListItemNode, ListNode } from '@lexical/list';
import { act } from '@testing-library/react';
import { $createTextNode, $getNodeByKey, $getRoot, $setState, createEditor } from 'lexical';
import type { LexicalEditor } from 'lexical';
import { describe, expect, it } from 'vitest';

import { $getNoteId, noteIdState } from '#client/editor/runtime/note-id-state';
import { meta } from '#tests';
import { $replayLadder, emptyLadder, popStep, pushStep } from '#client/editor/outline/selection/rungs';

function createListEditor(): { editor: LexicalEditor; dispose: () => void } {
  const editor = createEditor({
    namespace: 'selection-rungs-test',
    nodes: [ListNode, ListItemNode],
  });

  return {
    editor,
    dispose: () => {},
  };
}

/**
 * Build the tree-complex fixture structure programmatically:
 *
 * - note1
 *   - note2
 *     - note3
 *   - note4
 * - note5
 * - note6
 *   - note7
 *
 * Returns a map from noteId -> Lexical node key.
 */
function $buildTreeComplex(): Map<string, string> {
  const keys = new Map<string, string>();

  const root = $getRoot();
  root.clear();
  const rootList = $createListNode('bullet');
  root.append(rootList);

  function makeContent(noteId: string): ListItemNode {
    const item = $createListItemNode();
    $setState(item, noteIdState, noteId);
    item.append($createTextNode(noteId));
    keys.set(noteId, item.getKey());
    return item;
  }

  function makeWrapper(...children: ListItemNode[]): ListItemNode {
    const wrapper = $createListItemNode();
    const nested = $createListNode('bullet');
    wrapper.append(nested);
    for (const child of children) {
      nested.append(child);
    }
    return wrapper;
  }

  const note3 = makeContent('note3');
  const note2 = makeContent('note2');
  const note2Wrapper = makeWrapper(note3);

  const note4 = makeContent('note4');

  const note1 = makeContent('note1');
  const note1Wrapper = makeWrapper(note2, note2Wrapper, note4);

  const note5 = makeContent('note5');
  const note6 = makeContent('note6');
  const note7 = makeContent('note7');
  const note6Wrapper = makeWrapper(note7);

  rootList.append(note1, note1Wrapper, note5, note6, note6Wrapper);

  return keys;
}

describe('selection rungs (pure algebra)', () => {
  it('starts empty and pushes the first structural rung as a neutral subtree', () => {
    const l0 = emptyLadder('anchorKey');
    expect(l0.stack).toEqual([]);
    const l1 = pushStep(l0, 'down'); // inline body
    const l2 = pushStep(l1, 'down'); // note + subtree (direction-neutral)
    expect(l2.stack.at(-1)).toMatchObject({ kind: 'subtree' });
    expect(l2.direction).toBeNull(); // not set until the first sweep
  });

  it('pop is the exact inverse of push', () => {
    const l = pushStep(pushStep(pushStep(emptyLadder('a'), 'down'), 'down'), 'down');
    expect(popStep(l)).toEqual(pushStep(pushStep(emptyLadder('a'), 'down'), 'down'));
  });

  it('records sweep direction on the first sweep step', () => {
    let l = pushStep(pushStep(emptyLadder('a'), 'down'), 'down'); // inline, subtree
    l = pushStep(l, 'down'); // first sweep -> direction down
    expect(l.direction).toBe('down');
    l = popStep(popStep(popStep(l))); // back to empty
    expect(l.stack).toEqual([]);
    expect(l.direction).toBeNull();
  });
});

describe('$replayLadder', () => {
  it(
    'stack [subtree] -> range note2..note3 (anchor + its subtree)',
    meta({ fixture: 'flat' }),
    async () => {
      const { editor, dispose } = createListEditor();
      try {
        let startId: string | null = null;
        let endId: string | null = null;

        await act(async () => {
          editor.update(() => {
            const keys = $buildTreeComplex();
            const note2 = $getNodeByKey<ListItemNode>(keys.get('note2')!)!;

            const plan = $replayLadder(note2, [{ kind: 'subtree' }]);

            if (plan && plan.type === 'range') {
              startId = $getNoteId($getNodeByKey<ListItemNode>(plan.startKey)!);
              endId = $getNoteId($getNodeByKey<ListItemNode>(plan.endKey)!);
            }
          });
        });

        expect(startId).toBe('note2');
        expect(endId).toBe('note3');
      } finally {
        dispose();
      }
    }
  );

  it(
    'stack [subtree, sibling(down)] -> range note2..note4 (adds sibling note4)',
    meta({ fixture: 'flat' }),
    async () => {
      const { editor, dispose } = createListEditor();
      try {
        let startId: string | null = null;
        let endId: string | null = null;

        await act(async () => {
          editor.update(() => {
            const keys = $buildTreeComplex();
            const note2 = $getNodeByKey<ListItemNode>(keys.get('note2')!)!;

            const plan = $replayLadder(note2, [
              { kind: 'subtree' },
              { kind: 'sibling', direction: 'down' },
            ]);

            if (plan && plan.type === 'range') {
              startId = $getNoteId($getNodeByKey<ListItemNode>(plan.startKey)!);
              endId = $getNoteId($getNodeByKey<ListItemNode>(plan.endKey)!);
            }
          });
        });

        // note2 subtree ends at note3; extending down adds note4 (leaf)
        expect(startId).toBe('note2');
        expect(endId).toBe('note4');
      } finally {
        dispose();
      }
    }
  );

  it(
    'stack [subtree, hoist] -> note1 subtree note1..note4',
    meta({ fixture: 'flat' }),
    async () => {
      const { editor, dispose } = createListEditor();
      try {
        let startId: string | null = null;
        let endId: string | null = null;

        await act(async () => {
          editor.update(() => {
            const keys = $buildTreeComplex();
            const note2 = $getNodeByKey<ListItemNode>(keys.get('note2')!)!;

            const plan = $replayLadder(note2, [{ kind: 'subtree' }, { kind: 'hoist' }]);

            if (plan && plan.type === 'range') {
              startId = $getNoteId($getNodeByKey<ListItemNode>(plan.startKey)!);
              endId = $getNoteId($getNodeByKey<ListItemNode>(plan.endKey)!);
            }
          });
        });

        // hoist from note2 -> parent note1; subtree of note1 covers note1..note4
        expect(startId).toBe('note1');
        expect(endId).toBe('note4');
      } finally {
        dispose();
      }
    }
  );
});
