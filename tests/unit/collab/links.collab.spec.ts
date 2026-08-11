import { $isAutoLinkNode } from '@lexical/link';
import { waitFor } from '@testing-library/react';
import { $isTextNode } from 'lexical';
import { describe, expect, it } from 'vitest';

import { $findNoteById } from '#client/editor/outline/note-traversal';
import { $setAutomaticLinkUnlinkedText } from '#client/editor/runtime/automatic-link-state';
import { meta, placeCaretAtNote, pressKey, selectEntireNote, typeText } from '#tests';
import type { RemdoTestApi } from '#client/editor/plugins/dev';
import { createCollabPeer } from './_support/remdo-peers';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';

function readAutomaticLink(remdo: RemdoTestApi) {
  return remdo.editor.getEditorState().read(() => {
    const link = $findNoteById('note1')!.getChildren().find($isAutoLinkNode);
    return link
      ? { isUnlinked: link.getIsUnlinked(), text: link.getTextContent(), url: link.getURL() }
      : null;
  }, { editor: remdo.editor });
}

describe('generic link collaboration', { timeout: COLLAB_LONG_TIMEOUT_MS }, () => {
  it('closes pinned link controls when a peer changes the target text', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const secondary = await createCollabPeer(remdo);
    await placeCaretAtNote(remdo, 'note1', 2);
    await pressKey(remdo, { key: 'k', ctrlOrMeta: true });
    expect(document.querySelector('[data-link-controls]')).not.toBeNull();

    secondary.editor.update(() => {
      const text = $findNoteById('note1')!.getFirstChild();
      if ($isTextNode(text)) {
        text.setTextContent(`remote ${text.getTextContent()}`);
      }
    });

    await waitFor(() => {
      expect(document.querySelector('[data-link-controls]')).toBeNull();
    });
  });

  it('ends occurrence suppression when another peer edits its text', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const secondary = await createCollabPeer(remdo);
    const url = 'https://example.com/';
    await selectEntireNote(remdo, 'note1');
    await typeText(remdo, url);
    await typeText(remdo, ' ');

    await waitFor(() => {
      expect(readAutomaticLink(secondary)).toMatchObject({ isUnlinked: false, text: url });
    });

    await placeCaretAtNote(remdo, 'note2', Number.POSITIVE_INFINITY);
    await typeText(remdo, 'x');
    secondary.editor.update(() => {
      const link = $findNoteById('note1')!.getChildren().find($isAutoLinkNode)!;
      const text = link.getFirstChild();
      if ($isTextNode(text)) {
        text.setTextContent('HTTPS://EXAMPLE.COM/');
      }
    });
    await waitFor(() => {
      expect(readAutomaticLink(remdo)).toMatchObject({
        isUnlinked: false,
        text: 'HTTPS://EXAMPLE.COM/',
      });
    });

    secondary.editor.update(() => {
      const link = $findNoteById('note1')!.getChildren().find($isAutoLinkNode)!;
      $setAutomaticLinkUnlinkedText(link, link.getTextContent());
      link.setIsUnlinked(true);
    });

    await waitFor(() => {
      expect(readAutomaticLink(remdo)?.isUnlinked).toBe(true);
      expect(readAutomaticLink(secondary)?.isUnlinked).toBe(true);
    });

    remdo.editor.update(() => {
      const link = $findNoteById('note1')!.getChildren().find($isAutoLinkNode)!;
      const text = link.getFirstChild();
      if ($isTextNode(text)) {
        text.setTextContent(url);
      }
    });

    await waitFor(() => {
      expect(readAutomaticLink(remdo)).toEqual({
        isUnlinked: false,
        text: url,
        url: 'https://example.com/',
      });
      expect(readAutomaticLink(secondary)).toEqual(readAutomaticLink(remdo));
    });
  });
});
