import { afterEach, describe, expect, it, vi } from 'vitest';
import { asCollaborationProviderEvents, createProviderFactory, waitForSync } from '#collaboration/runtime';
import type { ProviderFactoryResult } from '#collaboration/runtime';
import { resolveCollabServerOrigin } from '#platform/net/origins';
import { createCollabTestDocument } from './_support/documents';
import { installAuthenticatedApiFetch } from './_support/auth';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';

const providers: ProviderFactoryResult[] = [];
let restoreAuthentication: (() => void) | undefined;

async function createProvider(id: string) {
  restoreAuthentication ??= await installAuthenticatedApiFetch();
  const result = createProviderFactory({
    visibleOrigin: resolveCollabServerOrigin(),
  })(id, new Map());
  providers.push(result);
  return result;
}

function hidePage() {
  window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
}

function restorePage() {
  window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
}

afterEach(() => {
  for (const { provider, doc } of providers.splice(0)) {
    provider.destroy();
    doc.destroy();
  }
  if (vi.isMockFunction(globalThis.WebSocket)) globalThis.WebSocket.mockRestore();
  if (vi.isMockFunction(globalThis.fetch)) vi.mocked(globalThis.fetch).mockRestore();
  restoreAuthentication?.();
  restoreAuthentication = undefined;
});

describe('provider page lifecycle', { timeout: COLLAB_LONG_TIMEOUT_MS }, () => {
  it('reconnects an established provider across repeated page restorations', async () => {
    await createCollabTestDocument('pagerestore');
    const { provider, doc } = await createProvider('pagerestore');
    void provider.connect();
    await waitForSync(asCollaborationProviderEvents(provider));
    for (const value of ['first', 'second']) {
      hidePage();
      expect(provider.status).toBe('offline');
      doc.getMap('lifecycle').set('value', value);
      restorePage();
      await waitForSync(asCollaborationProviderEvents(provider));
      expect(provider.status).toBe('connected');
      expect(provider.hasLocalChanges).toBe(false);
    }
  });

  it('clears remote awareness on disconnect and restores live peers on reconnect', async () => {
    await createCollabTestDocument('pageawareness');
    const first = await createProvider('pageawareness');
    const second = await createProvider('pageawareness');
    first.provider.awareness.setLocalStateField('name', 'local');
    second.provider.awareness.setLocalStateField('name', 'peer');
    await Promise.all([first.provider.connect(), second.provider.connect()]);
    await expect.poll(() => first.provider.awareness.getStates().get(second.doc.clientID)?.name).toBe('peer');
    const localState = first.provider.awareness.getLocalState();

    first.provider.disconnect();
    expect(first.provider.awareness.getStates()).toEqual(new Map([[first.doc.clientID, localState]]));
    expect(first.provider.status).toBe('offline');

    await first.provider.connect();
    second.provider.awareness.setLocalStateField('name', 'peer updated');
    await expect.poll(() => first.provider.awareness.getStates().get(second.doc.clientID)?.name).toBe('peer updated');
    expect(first.provider.awareness.getLocalState()).toEqual(localState);
  });

  it('keeps an intentionally disconnected provider offline on restoration', async () => {
    await createCollabTestDocument('pageoffline');
    const { provider } = await createProvider('pageoffline');
    void provider.connect();
    await waitForSync(asCollaborationProviderEvents(provider));
    provider.disconnect();
    hidePage();
    restorePage();
    expect(provider.status).toBe('offline');
  });

  it('does not revive a destroyed provider on restoration', async () => {
    await createCollabTestDocument('pagedestroy');
    const { provider } = await createProvider('pagedestroy');
    void provider.connect();
    await waitForSync(asCollaborationProviderEvents(provider));
    hidePage();
    provider.destroy();
    restorePage();
    void provider.connect();
    expect(provider.status).toBe('offline');
  });

  it('keeps another consumer connected after one is destroyed', async () => {
    await createCollabTestDocument('pageindependent');
    const first = await createProvider('pageindependent');
    const second = await createProvider('pageindependent');
    void first.provider.connect();
    void second.provider.connect();
    await Promise.all([waitForSync(asCollaborationProviderEvents(first.provider)), waitForSync(asCollaborationProviderEvents(second.provider))]);
    first.provider.destroy();
    second.doc.getMap('lifecycle').set('survived', true);
    await waitForSync(asCollaborationProviderEvents(second.provider));
    expect(second.provider.status).toBe('connected');
    expect(second.provider.hasLocalChanges).toBe(false);
  });
});
