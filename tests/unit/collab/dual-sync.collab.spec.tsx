import { waitFor } from '@testing-library/react';
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical';
import { $createListItemNode, $createListNode } from '@lexical/list';
import { describe, expect, it } from 'vitest';
import type { RemdoTestApi } from '@/editor/plugins/dev';
import { renderCollabEditor } from './_support/remdo-peers';

describe('collaboration sync', () => {
  it('syncs edits between editors', async ({ remdo }) => {
    const docId = remdo.getCollabDocId();
    const secondary: RemdoTestApi = await renderCollabEditor({ docId });

    await Promise.all([remdo.waitForSynced(), secondary.waitForSynced()]);

    remdo.editor.update(() => {
      $getRoot().clear();
    });

    await Promise.all([remdo.waitForSynced(), secondary.waitForSynced()]);

    await waitFor(() => {
      expect(remdo).toMatchOutline([]);
      expect(secondary).toMatchOutline([]);
    });

    await Promise.all([remdo.waitForSynced(), secondary.waitForSynced()]);
    remdo.editor.update(() => {
      // TODO: use a higher level API once we have it
      const root = $getRoot();
      const list = $createListNode('bullet');
      const item = $createListItemNode();
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode('note1'));
      item.append(paragraph);
      list.append(item);
      root.append(list);
    });

    await Promise.all([remdo.waitForSynced(), secondary.waitForSynced()]);

    await remdo.waitForSynced();
    await secondary.waitForSynced();
    const sharedOutline = [{ text: 'note1', children: [] }];
    await waitFor(() => {
      expect(remdo).toMatchOutline(sharedOutline);
      expect(secondary).toMatchOutline(sharedOutline);
    });
  });
});
