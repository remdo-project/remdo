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
    const note = runtime.session.note('note2');
    const listener = vi.fn();
    note.subscribe(listener);

    expect(note.text()).toBe('note2');
    const options = { query: 'updated', limit: 10, childPreviewLimit: 2 };
    expect(await runtime.session.search(options)).toEqual({ flatResults: [], hasMore: false });

    await peer.updateNoteText('note2', 'updated by peer');

    await waitFor(() => {
      expect(note.text()).toBe('updated by peer');
      expect(listener).toHaveBeenCalledOnce();
    });
    const { flatResults } = await runtime.session.search(options);
    expect(flatResults.map(({ note }) => ({ id: note.id, text: note.text })))
      .toEqual([{ id: 'note2', text: 'updated by peer' }]);
  });
});
