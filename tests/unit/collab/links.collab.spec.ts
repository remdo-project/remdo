import { $isAutoLinkNode } from '@lexical/link';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { $isTextNode, UNDO_COMMAND } from 'lexical';
import { describe, expect, it } from 'vitest';

import { $findNoteById } from '#client/editor/outline/note-traversal';
import {
  $getAutomaticLinkUnlinkedText,
} from '#client/editor/runtime/automatic-link-state';
import { meta, placeCaretAtNote, pressKey, selectEntireNote, typeText } from '#tests';
import type { RemdoTestApi } from '#client/editor/plugins/dev';
import { createCollabPeer } from './_support/remdo-peers';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';

function readAutomaticLink(remdo: RemdoTestApi, noteId = 'note1') {
  return remdo.editor.getEditorState().read(() => {
    const link = $findNoteById(noteId)!.getChildren().find($isAutoLinkNode);
    return link
      ? { isUnlinked: link.getIsUnlinked(), text: link.getTextContent(), url: link.getURL() }
      : null;
  }, { editor: remdo.editor });
}

async function removeFirstGenericLink(remdo: RemdoTestApi) {
  await act(async () => {
    fireEvent.click(remdo.editor.getRootElement()!.querySelector('a')!, { detail: 1 });
  });
  const controls = document.querySelector<HTMLElement>('[data-link-controls]')!;
  const remove = [...controls.querySelectorAll('button')]
    .find(button => button.textContent === 'Remove link')!;
  await act(async () => fireEvent.click(remove));
  await remdo.waitForSynced();
}

describe('generic link collaboration', { timeout: COLLAB_LONG_TIMEOUT_MS }, () => {
  it('waits for a remote typing boundary before recognizing a URL', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const secondary = await createCollabPeer(remdo);
    const url = 'https://example.com/';
    await selectEntireNote(secondary, 'note1');
    await typeText(secondary, url);

    await waitFor(() => {
      expect(remdo.editor.getEditorState().read(
        () => $findNoteById('note1')!.getTextContent(),
        { editor: remdo.editor },
      )).toBe(url);
    });
    await remdo.waitForSynced();
    await secondary.waitForSynced();
    expect(readAutomaticLink(remdo)).toBeNull();
    expect(readAutomaticLink(secondary)).toBeNull();

    await typeText(secondary, ' ');

    await waitFor(() => {
      expect(readAutomaticLink(remdo)).toMatchObject({ text: url, url });
      expect(readAutomaticLink(secondary)).toMatchObject({ text: url, url });
    });
  });

  it('closes pinned link controls when a peer changes the target text', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const secondary = await createCollabPeer(remdo);
    await placeCaretAtNote(remdo, 'note1', 2);
    await pressKey(remdo, { key: 'k', ctrlOrMeta: true });
    expect(document.querySelector('[data-link-controls]')).not.toBeNull();

    await secondary.mutate(() => {
      const text = $findNoteById('note1')!.getFirstChild();
      if ($isTextNode(text)) {
        text.setTextContent(`remote ${text.getTextContent()}`);
      }
    });

    await waitFor(() => {
      expect(document.querySelector('[data-link-controls]')).toBeNull();
    });
  });

  it('keeps caret controls open when a peer appends unrelated text', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const secondary = await createCollabPeer(remdo);
    await placeCaretAtNote(remdo, 'note1', 2);
    await pressKey(remdo, { key: 'k', ctrlOrMeta: true });
    expect(document.querySelector('[data-link-controls]')).not.toBeNull();

    await secondary.mutate(() => {
      const text = $findNoteById('note1')!.getFirstChild();
      if ($isTextNode(text)) {
        text.setTextContent(`${text.getTextContent()} remote`);
      }
    });

    await waitFor(() => {
      expect(remdo.editor.getEditorState().read(
        () => $findNoteById('note1')!.getTextContent(),
        { editor: remdo.editor },
      )).toBe('note1 remote');
    });
    expect(document.querySelector('[data-link-controls]')).not.toBeNull();
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
    await secondary.mutate(() => {
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

    await removeFirstGenericLink(remdo);

    await waitFor(() => {
      expect(readAutomaticLink(remdo)?.isUnlinked).toBe(true);
      expect(readAutomaticLink(secondary)?.isUnlinked).toBe(true);
      expect(secondary.editor.getEditorState().read(() => {
        const link = $findNoteById('note1')!.getChildren().find($isAutoLinkNode)!;
        return $getAutomaticLinkUnlinkedText(link);
      }, { editor: secondary.editor })).toBe('HTTPS://EXAMPLE.COM/');
    });

    await remdo.mutate(() => {
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
      expect(readAutomaticLink(secondary)).toEqual({
        isUnlinked: false,
        text: url,
        url: 'https://example.com/',
      });
    });
  });

  it('keeps immediate Undo scoped to the local same-URL occurrence', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const secondary = await createCollabPeer(remdo);
    const url = 'https://example.com/';
    await selectEntireNote(remdo, 'note1');
    await typeText(remdo, url);

    await selectEntireNote(secondary, 'note2');
    await typeText(secondary, url);
    await typeText(secondary, ' ');
    await waitFor(() => {
      expect(readAutomaticLink(remdo, 'note2')).toMatchObject({ isUnlinked: false, text: url });
    });

    await typeText(remdo, ' ');
    await remdo.dispatchCommand(UNDO_COMMAND);
    await waitFor(() => {
      expect(readAutomaticLink(remdo, 'note1')?.isUnlinked).toBe(true);
      expect(readAutomaticLink(remdo, 'note2')?.isUnlinked).toBe(false);
    });
  });

  it('keeps immediate Undo available across an unrelated remote edit', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const secondary = await createCollabPeer(remdo);
    const url = 'https://example.com/';
    await selectEntireNote(remdo, 'note1');
    await typeText(remdo, url);
    await typeText(remdo, ' ');
    await waitFor(() => {
      expect(readAutomaticLink(secondary)).toMatchObject({ isUnlinked: false, text: url });
    });

    await placeCaretAtNote(secondary, 'note2', Number.POSITIVE_INFINITY);
    await typeText(secondary, ' remote');
    await waitFor(() => {
      expect(remdo.editor.getEditorState().read(
        () => $findNoteById('note2')!.getTextContent(),
        { editor: remdo.editor },
      )).toBe('note2 remote');
    });

    await remdo.dispatchCommand(UNDO_COMMAND);
    await waitFor(() => {
      expect(readAutomaticLink(remdo)?.isUnlinked).toBe(true);
      expect(readAutomaticLink(secondary)?.isUnlinked).toBe(true);
    });
  });
});
