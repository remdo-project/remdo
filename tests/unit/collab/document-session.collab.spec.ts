import { waitFor } from '@testing-library/react';
import { describe, expect, it, onTestFinished } from 'vitest';
import type { LoadState } from '#note-sdk';
import { meta } from '#tests';
import { createLexicalDocumentSessionRuntime } from '#client/editor/note-sdk-adapters/lexical-document-session';
import { createCollabPeer } from './_support/remdo-peers';

function requireReady<T>(state: LoadState<T>): T {
  if (state.status !== 'ready') {
    throw new Error(`Expected a ready SDK snapshot, got ${state.status}.`);
  }
  return state.data;
}

describe('document session collaboration', () => {
  it('publishes a remote note edit through the same document snapshot', meta({
    collabDocId: 'sdkRemoteEdit',
    fixture: 'tree',
  }), async ({ remdo }) => {
    await remdo.waitForSynced();
    const peer = await createCollabPeer(remdo);
    await peer.waitForSynced();
    const runtime = createLexicalDocumentSessionRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    runtime.start();
    runtime.setSourceReady(true);
    runtime.session.document.subscribe(() => {});
    onTestFinished(() => runtime.dispose());

    await waitFor(() => {
      expect(requireReady(runtime.session.document.getSnapshot()).notes.get('note2')?.text)
        .toBe('note2');
    });

    await peer.updateNoteText('note2', 'updated by peer');

    await waitFor(() => {
      expect(requireReady(runtime.session.document.getSnapshot()).notes.get('note2')?.text)
        .toBe('updated by peer');
    });
  });
});
