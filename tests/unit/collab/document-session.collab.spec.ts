import { waitFor } from '@testing-library/react';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { meta } from '#tests';
import { createLexicalDocumentSessionRuntime } from '#client/editor/note-sdk-adapters/lexical-document-session';
import { createCollabPeer } from './_support/remdo-peers';

describe('document session collaboration', () => {
  it('observes a remote note edit and includes it in the next search', meta({
    collabDocId: 'sdkRemoteEdit',
    fixture: 'tree',
  }), async ({ remdo }) => {
    await remdo.updateNoteText('note2', 'edited before join');
    await remdo.waitForSynced();
    const peer = await createCollabPeer(remdo);
    await peer.waitForSynced();
    const runtime = createLexicalDocumentSessionRuntime({
      editor: remdo.editor,
      docId: remdo.getCollabDocId(),
    });
    runtime.start();
    runtime.setSourceReady(true);
    onTestFinished(() => runtime.dispose());
    const note = runtime.session.noteRef('note2');
    const listener = vi.fn();
    note.subscribe(listener);

    expect(note.getText()).toBe('edited before join');
    expect(peer.documentSession.noteRef('note2').getText()).toBe('edited before join');
    const options = { query: 'updated', limit: 10, childPreviewLimit: 2 };
    expect(await runtime.session.search(options)).toEqual({ flatResults: [], hasMore: false });

    await peer.updateNoteText('note2', 'updated by peer');

    await waitFor(() => {
      expect(note.getText()).toBe('updated by peer');
      expect(listener).toHaveBeenCalledOnce();
    });
    const { flatResults } = await runtime.session.search(options);
    expect(flatResults.map(({ note }) => ({ id: note.id, text: note.text })))
      .toEqual([{ id: 'note2', text: 'updated by peer' }]);
  });

  it('observes addressed state changed through a peer session', meta({
    collabDocId: 'sdkRemoteActions',
    fixture: 'tree',
  }), async ({ remdo }) => {
    await remdo.waitForSynced();
    const peer = await createCollabPeer(remdo);
    await peer.waitForSynced();
    const note = remdo.documentSession.noteRef('note2');
    const listener = vi.fn();
    onTestFinished(note.subscribe(listener));
    const remote = peer.documentSession.noteRef('note2');

    await remote.toggleChecked();
    await remote.setChildListType('number');
    await remote.toggleFold();

    await waitFor(() => {
      expect(note.getChecked()).toBe(true);
      expect(note.getChildListType()).toBe('number');
      expect(note.getFolded()).toBe(true);
      expect(remdo.documentSession.noteRef('note3').getChecked()).toBe(true);
      expect(listener).toHaveBeenCalled();
    });
  });
});
