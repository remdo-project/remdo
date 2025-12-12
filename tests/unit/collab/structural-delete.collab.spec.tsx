import { describe, expect, it } from 'vitest';
import { waitFor } from '@testing-library/react';

import { placeCaretAtNote, pressKey, readOutline } from '#tests';
import { renderCollabEditor } from './_support/remdo-peers';

describe('collab structural delete regression', () => {
  it('bubbles Delete when structural selection was removed by a collaborator', async ({ remdo }) => {
    const docId = remdo.getCollabDocId();
    await remdo.load('tree_complex');
    await remdo.waitForSynced();

    const editorA = remdo;
    const editorB = await renderCollabEditor({ docId });
    await editorB.waitForSynced();
    await waitFor(() => {
      expect(readOutline(editorB)).toEqual(readOutline(editorA));
    });

    await placeCaretAtNote(editorA, 'note2');
    await pressKey(editorA, { key: 'ArrowDown', shift: true });
    await pressKey(editorA, { key: 'ArrowDown', shift: true });

    const expectedAfterRemoteDelete = [
      { text: 'note1', children: [ { text: 'note4' } ] },
      { text: 'note5' },
      { text: 'note6', children: [ { text: 'note7' } ] },
    ];

    await placeCaretAtNote(editorB, 'note2');
    await pressKey(editorB, { key: 'ArrowDown', shift: true });
    await pressKey(editorB, { key: 'ArrowDown', shift: true });
    await pressKey(editorB, { key: 'Backspace' });

    await Promise.all([editorA.waitForSynced(), editorB.waitForSynced()]);
    await waitFor(() => {
      expect(readOutline(editorA)).toEqual(expectedAfterRemoteDelete);
    });

    let bubbled = false;
    const bubbleProbe = (event: KeyboardEvent) => {
      if (event.key === 'Delete') {
        bubbled = true;
      }
    };
    document.body.addEventListener('keydown', bubbleProbe);

    await pressKey(editorA, { key: 'Delete' });

    document.body.removeEventListener('keydown', bubbleProbe);

    expect(bubbled).toBe(true);

    await Promise.all([editorA.waitForSynced(), editorB.waitForSynced()]);

    const flattenText = (nodes: ReturnType<typeof readOutline>): string[] => {
      const out: string[] = [];
      const walk = (xs: typeof nodes) => {
        for (const node of xs) {
          if (node.text) out.push(node.text);
          if (node.children?.length) {
            walk(node.children);
          }
        }
      };
      walk(nodes);
      return out;
    };

    const afterA = readOutline(editorA);
    const afterB = readOutline(editorB);

    const textsA = flattenText(afterA);
    const textsB = flattenText(afterB);

    expect(textsA).not.toContain('note2');
    expect(textsA).not.toContain('note3');
    expect(textsA).toContain('note1');
    expect(textsA).toContain('note5');
    expect(textsA).toContain('note6');
    expect(textsA.length).toBe(textsB.length);
    expect(textsB).toEqual(textsA);

    // TODO: Add an e2e variant mirroring real browser behavior where the caret
    // rehomes into note4 and Delete changes "note4" -> "ote4" after the remote
    // structural delete, to cover the inline deletion path post-sync.
  });
});
