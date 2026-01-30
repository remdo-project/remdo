import { waitFor } from '@testing-library/react';
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical';
import { $createListItemNode, $createListNode } from '@lexical/list';
import { describe, expect, it } from 'vitest';
import { readOutline } from '#tests';
import { createCollabPeer } from './_support/remdo-peers';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';

describe('collaboration sync', { timeout: COLLAB_LONG_TIMEOUT_MS }, () => {
  it('syncs edits between editors', async ({ remdo }) => {
    const secondary = await createCollabPeer(remdo);

    remdo.editor.update(() => {
      $getRoot().clear();
    });

    await waitFor(() => {
      const outlineA = readOutline(remdo);
      expect(secondary).toMatchOutline(outlineA);
    });

    remdo.editor.update(() => {
      // TODO: use a higher level API once we have it
      const root = $getRoot();
      root.clear();
      const list = $createListNode('bullet');
      const firstItem = $createListItemNode();
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode('note1'));
      firstItem.append(paragraph);
      list.append(firstItem);
      root.append(list);
    });

    const sharedOutline = [{ noteId: null, text: 'note1' }];
    await waitFor(() => {
      expect(remdo).toMatchOutline(sharedOutline);
      expect(secondary).toMatchOutline(sharedOutline);
    });
  });
});
