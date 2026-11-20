import type { ListNode } from '@lexical/list';
import { $getRoot, $setState } from 'lexical';
import { describe, expect, it } from 'vitest';
import { $getNoteByText, meta, placeCaretAtNote, selectNoteRange, selectStructuralNotes } from '#tests';
import { $setNoteCheckedRaw } from '#client/editor/features/list-types/checked-state';
import { markerState } from '#client/editor/features/list-types/note-marker';

const document = `
  - plain
      - id:: k3x9
      - folded:: true
      - child
          - grandchild
  - **bold** and *italic*
  3. [ ] three
  4. [x] four
      > A body line.
  - Status:: in review, due [1 Nov 2026](date:2026-11-01)
  - edge&#32;
`;

describe('toMatchDocument', () => {
  it('matches a document as it started', meta({ document }), async ({ remdo }) => {
    expect(remdo).toMatchDocument(document);
  });

  for (const [difference, other] of [
    ['a marker', document.replace('3. [ ] three', '- [ ] three')],
    ['an open checkbox', document.replace('3. [ ] three', '3. three')],
    ['formatting', document.replace('**bold**', 'bold')],
    ['a written ID', document.replace('      - id:: k3x9\n', '')],
    ['fold state', document.replace('      - folded:: true\n', '')],
    ['a body', document.replace('      > A body line.\n', '')],
    ['a name', document.replace('Status::', String.raw`Status\::`)],
    ['a date', document.replace('date:2026-11-01', 'date:2026-11-02')],
    ['edge whitespace', document.replace('edge&#32;', 'edge')],
  ] as const) {
    it(`refuses a document differing in ${difference}`, meta({ document }), async ({ remdo }) => {
      expect(() => expect(remdo).toMatchDocument(other)).toThrow(/differs from the expected Markdown/u);
    });
  }

  it('refuses a list type, which a new-format document never stores', meta({ document: '- a\n- b' }), async ({ remdo }) => {
    await remdo.mutate(() => {
      ($getRoot().getFirstChild() as ListNode).setListType('check');
      $setState($getNoteByText('a'), markerState, undefined);
      $setState($getNoteByText('b'), markerState, undefined);
    });

    expect(() => expect(remdo).toMatchDocument('- [ ] a\n- [ ] b')).toThrow(/stored state isn't what applying its own tree gives/u);
  });

  it('refuses a checked note whose checkbox only its checked state implies', meta({ document: '- a' }), async ({ remdo }) => {
    await remdo.mutate(() => $setNoteCheckedRaw($getNoteByText('a'), true));

    expect(() => expect(remdo).toMatchDocument('- a')).toThrow(/stored state isn't what applying its own tree gives/u);
  });
  describe('selections', () => {
    const notes = '- alpha\n- beta\n    - gamma';

    it('matches a caret at its offset', meta({ document: notes }), async ({ remdo }) => {
      await placeCaretAtNote(remdo, 'beta', 2);

      expect(remdo).toMatchDocument('- alpha\n- be<selection />ta\n    - gamma');
      expect(() => expect(remdo).toMatchDocument('- alpha\n- b<selection />eta\n    - gamma')).toThrow(/differs/u);
    });

    it('matches a range within a note', meta({ document: notes }), async ({ remdo }) => {
      await selectNoteRange(remdo, 'alpha', 'alpha');

      expect(remdo).toMatchDocument('- <selection>alpha</selection>\n- beta\n    - gamma');
    });

    it('matches whole notes', meta({ document: notes }), async ({ remdo }) => {
      await selectStructuralNotes(remdo, 'alpha');

      expect(remdo).toMatchDocument('<selection>\n- alpha\n</selection>\n- beta\n    - gamma');
      expect(() => expect(remdo).toMatchDocument('<selection>\n- alpha\n- beta\n    - gamma\n</selection>')).toThrow(/differs/u);
    });
  });
});
