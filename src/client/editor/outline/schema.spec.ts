import { $getNoteByText, meta } from '#tests';
import { describe, expect, it } from 'vitest';

import {
  requireContentItem,
  requireContentItemFromNode,
  $requireContentItemNoteId,
  $requireRootContentList,
} from '#client/editor/outline/schema';

describe('outline schema helpers', () => {
  it('resolve canonical runtime nodes without nullable fallbacks', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const resolved = remdo.validate(() => {
      const rootList = $requireRootContentList();
      const note = $getNoteByText('note1');
      const text = note.getFirstChild()!;
      const contentFromItem = requireContentItem(note);
      const contentFromNode = requireContentItemFromNode(text);

      return {
        rootType: rootList.getType(),
        fromItemKey: contentFromItem.getKey(),
        fromNodeKey: contentFromNode.getKey(),
        noteId: $requireContentItemNoteId(contentFromNode),
      };
    });

    expect(resolved.rootType).toBe('list');
    expect(resolved.fromItemKey).toBe(resolved.fromNodeKey);
    expect(resolved.noteId).toBe('note1');
  });
});
