import { afterEach, describe, expect, it, vi } from 'vitest';
import { meta } from '#tests';
import { createDeferred } from '../_support/deferred';
import { asCollaborationProviderEvents, createProviderFactory, waitForSync } from '#collaboration/runtime';
import type { ProviderFactoryResult } from '#collaboration/runtime';
import { resolveApiServerOrigin, resolveCollabServerOrigin } from '#platform/net/origins';
import { createCollabTestDocument } from './_support/documents';
import { installAuthenticatedApiFetch } from './_support/auth';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

const providers: ProviderFactoryResult[] = [];
let restoreFetch: (() => void) | undefined;

async function createProvider(id: string) {
  const result = await createProviderFactory({
    apiOrigin: resolveApiServerOrigin(),
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
  restoreFetch?.();
  restoreFetch = undefined;
});

describe('provider page lifecycle', { timeout: COLLAB_LONG_TIMEOUT_MS }, () => {
  it.each([
    { outcome: 'success', timing: 'before' },
    { outcome: 'failure', timing: 'before' },
    { outcome: 'success', timing: 'after' },
    { outcome: 'failure', timing: 'after' },
  ])('ignores late token $outcome $timing restoration and synchronizes the fresh connection', async ({ outcome, timing }) => {
    const RealWebSocket = globalThis.WebSocket;
    // eslint-disable-next-line prefer-arrow-callback -- Vitest invokes constructor replacements with new.
    const sockets = vi.spyOn(globalThis, 'WebSocket').mockImplementation(function createSocket(url, protocols) {
      return new RealWebSocket(url, protocols);
    });
    await createCollabTestDocument(`late${outcome}${timing}`);
    const { provider, doc } = await createProvider(`late${outcome}${timing}`);
    restoreFetch = await installAuthenticatedApiFetch();
    const originalFetch = globalThis.fetch;
    const lateToken = deferred<Response>();
    const requested = createDeferred();
    let oldRequest: Request | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce((input, init) => {
      oldRequest = new Request(input, init);
      requested.resolve();
      return lateToken.promise;
    });

    const oldConnect = provider.connect();
    await requested.promise;
    hidePage();
    expect(oldRequest!.signal.aborted).toBe(true);
    expect(provider.status).toBe('offline');
    if (timing === 'after') {
      restorePage();
      await waitForSync(asCollaborationProviderEvents(provider));
    }

    if (outcome === 'success') {
      // An aborted request can already have queued its response before departure.
      lateToken.resolve(await originalFetch(new Request(oldRequest!, { signal: new AbortController().signal })));
    } else {
      lateToken.reject(new TypeError('Failed to fetch'));
    }
    await oldConnect;
    if (timing === 'before') {
      restorePage();
      await waitForSync(asCollaborationProviderEvents(provider));
    }
    expect(sockets).toHaveBeenCalledTimes(1);
    expect(provider.status).toBe('connected');
    doc.getMap('lifecycle').set('restored', outcome);
    await waitForSync(asCollaborationProviderEvents(provider));
    expect(provider.hasLocalChanges).toBe(false);
  });

  it('reconnects an established provider across repeated page restorations', async () => {
    await createCollabTestDocument('pagerestore');
    const { provider, doc } = await createProvider('pagerestore');
    restoreFetch = await installAuthenticatedApiFetch();
    await provider.connect();
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

  it('stops a socket handshake on departure and reconnects on restoration', async () => {
    const socketCreated = createDeferred();
    const RealWebSocket = globalThis.WebSocket;
    // eslint-disable-next-line prefer-arrow-callback -- Vitest invokes constructor replacements with new.
    vi.spyOn(globalThis, 'WebSocket').mockImplementation(function createSocket(url, protocols) {
      const socket = new RealWebSocket(url, protocols);
      socketCreated.resolve();
      return socket;
    });
    await createCollabTestDocument('pagehandshake');
    const { provider } = await createProvider('pagehandshake');
    restoreFetch = await installAuthenticatedApiFetch();
    const connecting = provider.connect();
    await socketCreated.promise;
    hidePage();
    await connecting;
    expect(provider.status).toBe('offline');
    restorePage();
    await waitForSync(asCollaborationProviderEvents(provider));
    expect(provider.status).toBe('connected');
  });

  it('clears remote awareness on disconnect and restores live peers on reconnect', async () => {
    await createCollabTestDocument('pageawareness');
    const first = await createProvider('pageawareness');
    const second = await createProvider('pageawareness');
    restoreFetch = await installAuthenticatedApiFetch();
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
    restoreFetch = await installAuthenticatedApiFetch();
    await provider.connect();
    provider.disconnect();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    hidePage();
    restorePage();
    expect(provider.status).toBe('offline');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not revive a destroyed provider on restoration', async () => {
    await createCollabTestDocument('pagedestroy');
    const { provider } = await createProvider('pagedestroy');
    restoreFetch = await installAuthenticatedApiFetch();
    await provider.connect();
    hidePage();
    provider.destroy();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    restorePage();
    await provider.connect();
    expect(provider.status).toBe('offline');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps the restored shared request when a departed request settles later', async () => {
    await createCollabTestDocument('pagerequest');
    const first = await createProvider('pagerequest');
    const second = await createProvider('pagerequest');
    restoreFetch = await installAuthenticatedApiFetch();
    const originalFetch = globalThis.fetch;
    const departed = deferred<Response>();
    const restored = deferred<Response>();
    let restoredRequest: Request | undefined;
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockReturnValueOnce(departed.promise)
      .mockImplementationOnce((input, init) => {
        restoredRequest = new Request(input, init);
        return restored.promise;
      });
    const oldConnect = first.provider.connect();
    hidePage();
    restorePage();
    departed.reject(new TypeError('Failed to fetch'));
    await oldConnect;
    const peerConnect = second.provider.connect();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    restored.resolve(await originalFetch(restoredRequest!));
    await peerConnect;
    await waitForSync(asCollaborationProviderEvents(first.provider));
    expect(second.provider.status).toBe('connected');
  });

  it('synchronizes the live consumer when a shared token succeeds after the other is destroyed', async () => {
    await createCollabTestDocument('pagesharedsuccess');
    const first = await createProvider('pagesharedsuccess');
    const second = await createProvider('pagesharedsuccess');
    restoreFetch = await installAuthenticatedApiFetch();
    const originalFetch = globalThis.fetch;
    const token = deferred<Response>();
    let request: Request | undefined;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementationOnce((input, init) => {
      request = new Request(input, init);
      return token.promise;
    });
    const firstConnect = first.provider.connect();
    const secondConnect = second.provider.connect();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    first.provider.destroy();
    expect(request!.signal.aborted).toBe(false);
    token.resolve(await originalFetch(request!));
    await Promise.all([firstConnect, secondConnect]);
    second.doc.getMap('lifecycle').set('survived', true);
    await waitForSync(asCollaborationProviderEvents(second.provider));
    expect(first.provider.status).toBe('offline');
    expect(second.provider.status).toBe('connected');
    expect(second.provider.hasLocalChanges).toBe(false);
  });

  it('reports a shared token failure for the live consumer after the other is destroyed',
    meta({ expectedConsoleIssues: ['Failed to get client token'] }), async () => {
    await createCollabTestDocument('pageshared');
    const first = await createProvider('pageshared');
    const second = await createProvider('pageshared');
    const token = deferred<Response>();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(token.promise);
    const warnSpy = vi.mocked(console.warn);
    const firstConnect = first.provider.connect();
    const secondConnect = second.provider.connect();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    first.provider.destroy();
    const error = new TypeError('Failed to fetch');
    token.reject(error);
    await vi.waitFor(() => expect(warnSpy).toHaveBeenCalledWith('Failed to get client token', error));
    expect(second.provider.status).toBe('error');
    second.provider.destroy();
    await Promise.all([firstConnect, secondConnect]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
