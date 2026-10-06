import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerPendingDocumentImport } from '#client/editor/view/workspace';
import Editor from '#client/editor/shell/Editor';
import { EditorViewProvider } from '#client/editor/view/EditorViewProvider';
import { readFixture } from '#tools/fixtures';
import { meta, readOutline, TestMantineProvider } from '#tests';
import { ANALYTICS_CONSENT_GRANTED_EVENT } from '#platform/analytics';
import { createCollabTestDocument } from './_support/documents';
import { renderRemdoEditor } from './_support/render-editor';
import { createCollabPeer } from './_support/remdo-peers';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';

function installAnalytics() {
  const track = vi.fn();
  window.remdoAnalyticsAllowed = true;
  window.umami = { identify: vi.fn(), track };
  return track;
}

afterEach(() => {
  delete window.remdoAnalyticsAllowed;
  delete window.umami;
});

describe('document edit analytics', { timeout: COLLAB_LONG_TIMEOUT_MS }, () => {
  it('reports one edit per document opening', meta({ fixture: 'basic' }), async ({ remdo }) => {
    const track = installAnalytics();

    await remdo.updateNoteText('note1', 'first edit');
    await remdo.waitForSynced();
    await remdo.updateNoteText('note1', 'second edit');

    expect(track).toHaveBeenCalledOnce();
    expect(track).toHaveBeenCalledWith('document-edited');
  });

  it('counts only edits made in the editor that reports them', meta({ fixture: 'basic' }), async ({ remdo }) => {
    const track = installAnalytics();

    const peer = await createCollabPeer(remdo);
    await peer.waitForSynced();
    expect(track).not.toHaveBeenCalled();

    await peer.updateNoteText('note1', 'peer edit');
    await waitFor(() => expect(readOutline(remdo)[0]!.text).toBe('peer edit'));
    expect(track).toHaveBeenCalledOnce();

    await remdo.updateNoteText('note1', 'local edit');
    expect(track).toHaveBeenCalledTimes(2);
  });

  it('reports an edit made before consent once consent is granted', meta({ fixture: 'basic' }), async ({ remdo }) => {
    const track = installAnalytics();
    window.remdoAnalyticsAllowed = false;

    await remdo.updateNoteText('note1', 'edit before consent');
    expect(track).not.toHaveBeenCalled();

    window.remdoAnalyticsAllowed = true;
    window.dispatchEvent(new Event(ANALYTICS_CONSENT_GRANTED_EVENT));
    expect(track).toHaveBeenCalledExactlyOnceWith('document-edited');
  });

  it('does not report a document that was only opened', async () => {
    const track = installAnalytics();

    const { api, unmount } = await renderRemdoEditor(await createCollabTestDocument());
    try {
      await api.waitForSynced();
      expect(track).not.toHaveBeenCalled();
    } finally {
      unmount();
    }
  });

  it('reports an uploaded document as edited, because its content is a local change', async () => {
    const track = installAnalytics();
    const docId = await createCollabTestDocument();
    registerPendingDocumentImport(docId, new File([await readFixture('basic')], 'basic.json'));

    const { unmount } = render(
      <TestMantineProvider>
        <EditorViewProvider docId={docId} onZoomNoteIdChange={() => {}}>
          <Editor
            docId={docId}
            onSelectHome={() => {}}
            statusPortalRoot={null}
            onPendingDocumentImportError={(error) => { throw error; }}
          />
        </EditorViewProvider>
      </TestMantineProvider>,
    );
    try {
      await waitFor(() => expect(track).toHaveBeenCalledExactlyOnceWith('document-edited'));
    } finally {
      unmount();
    }
  });
});
