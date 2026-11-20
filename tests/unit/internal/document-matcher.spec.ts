import type { ListNode } from '@lexical/list';
import { $getRoot, $setState } from 'lexical';
import { describe, expect, it } from 'vitest';
import { $getNoteByText, meta } from '#tests';
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
});
