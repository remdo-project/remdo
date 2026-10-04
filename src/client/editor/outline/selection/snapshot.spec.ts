import { $createRangeSelection } from 'lexical';
import { describe, expect, it } from 'vitest';
import { meta } from '#tests';
import { $findNoteById } from '#client/editor/outline/note-traversal';
import { emptyLadder } from './rungs';
import { $computeOutlineSelectionSnapshot } from './snapshot';

describe('selection snapshot handoff', () => {
  for (const [handoff, anchorId, replacementId, stack, direction] of [
    ['subtree', 'note1', 'note3', [{ kind: 'subtree' }], 'down'],
    ['whole-sibling', 'note2', 'note1', [{ kind: 'inline' }, { kind: 'subtree' }, { kind: 'sibling', direction: null }], null],
  ] as const) {
    it(`accepts a replacement inline range in another note during a ${handoff} handoff`, meta({ fixture: 'flat' }), ({ remdo }) => {
      remdo.validate(() => {
        const anchor = $findNoteById(anchorId)!;
        const replacement = $findNoteById(replacementId)!.getAllTextNodes()[0]!;
        const selection = $createRangeSelection();
        selection.setTextNodeRange(replacement, 2, replacement, 4);
        const snapshot = $computeOutlineSelectionSnapshot({
          selection,
          isProgressiveTagged: false,
          isSnapTagged: false,
          treeChanged: false,
          progression: { ...emptyLadder(anchor.getKey()), stack: [...stack], direction },
          unlock: true,
          initialProgression: emptyLadder(''),
          boundaryKey: null,
        });

        expect(snapshot.outlineSelection?.kind).toBe('inline');
        expect(snapshot.progression.stack).toEqual([]);
        expect(selection.getTextContent()).toBe('te');
      });
    });
  }

  it('preserves the ladder anchor when a whole-sibling range normalizes to its first note', meta({ fixture: 'flat' }), ({ remdo }) => {
    remdo.validate(() => {
      const anchor = $findNoteById('note2')!;
      const first = $findNoteById('note1')!.getAllTextNodes()[0]!;
      const last = $findNoteById('note3')!.getAllTextNodes()[0]!;
      const selection = $createRangeSelection();
      selection.setTextNodeRange(first, 0, last, 5);
      const snapshot = $computeOutlineSelectionSnapshot({
        selection,
        isProgressiveTagged: false,
        isSnapTagged: false,
        treeChanged: false,
        progression: { ...emptyLadder(anchor.getKey()),
          stack: [{ kind: 'inline' }, { kind: 'subtree' }, { kind: 'sibling', direction: null }] },
        unlock: true,
        initialProgression: emptyLadder(''),
        boundaryKey: null,
      });

      expect(snapshot.outlineSelection?.kind).toBe('structural');
      expect(snapshot.progression.anchorKey).toBe(anchor.getKey());
      expect(snapshot.progression.stack).toHaveLength(3);
    });
  });
});
