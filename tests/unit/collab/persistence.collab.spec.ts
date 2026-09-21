import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { config } from '#config';
import { createProviderFactory, asCollaborationProviderEvents, waitForSync } from '#collaboration/runtime';
import { resolveApiServerOrigin, resolveCollabServerOrigin } from '#platform/net/origins';
import { createCollabTestDocument } from './_support/documents';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';

const headers = { 'X-Remdo-Collaboration-Secret': config.env.COLLAB_INTERNAL_SECRET };

describe('database collaboration persistence', { timeout: COLLAB_LONG_TIMEOUT_MS }, () => {
  it('commits insertions and deletion-only edits before the explicit flush returns', async () => {
    const id = 'persistCollabTest';
    await createCollabTestDocument(id);
    const { provider, doc } = createProviderFactory({ visibleOrigin: resolveCollabServerOrigin() })(id, new Map());
    const persisted = async () => {
      await waitForSync(asCollaborationProviderEvents(provider));
      const flushed = await fetch(`${resolveCollabServerOrigin()}/internal/collaboration/flush/${id}`, { method: 'POST', headers });
      expect(flushed.status).toBe(204);
      const response = await fetch(`${resolveApiServerOrigin()}/internal/collaboration/documents/${id}/content`, { headers });
      expect(response.status).toBe(200);
      const stored = new Y.Doc();
      Y.applyUpdate(stored, new Uint8Array(await response.arrayBuffer()));
      const text = stored.getText('persistence-test').toString();
      stored.destroy();
      return text;
    };
    try {
      await provider.connect();
      await waitForSync(asCollaborationProviderEvents(provider));
      doc.getText('persistence-test').insert(0, 'durable');
      expect(await persisted()).toBe('durable');
      doc.getText('persistence-test').delete(0, 7);
      expect(await persisted()).toBe('');
    } finally {
      provider.destroy();
      doc.destroy();
    }
  });
});
