import type * as Y from 'yjs';
import type { CollaborationProviderEventsView } from '#collaboration/runtime';
import { expect, test } from '#e2e/fixtures';
import type { Page } from '#e2e/fixtures';
import { createUserDocument } from '../_support/documents';

declare global {
  interface Window {
    __collaborationLifecycle?: {
      doc: Y.Doc;
      provider: CollaborationProviderEventsView;
      peer: CollaborationProviderEventsView;
      restores: number;
    };
  }
}

// Chromium's headless shell disables BFCache at the browser delegate level.
// Use the full Chromium browser and remove Playwright's default opt-out.
test.use({
  channel: 'chromium',
  permissions: ['local-network-access'],
  launchOptions: { ignoreDefaultArgs: ['--disable-back-forward-cache'] },
});

async function openLifecycleFixture(page: Page) {
  // Exclude Vite's HMR socket while using the real collaboration runtime.
  const fixturePath = '/collaboration-lifecycle.html';
  await page.route(`**${fixturePath}`, (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><title>Collaboration lifecycle</title>',
  }));
  await page.goto(fixturePath);
}

for (const phase of ['pending', 'connected'] as const) {
  test(`restores a ${phase} collaboration connection from the browser back-forward cache`, async ({ page }) => {
    const { id } = await createUserDocument(page, 'Cache restoration');
    await openLifecycleFixture(page);
    await page.evaluate(async ({ docId, phase }) => {
      const runtimePath = '/src/collaboration/runtime.ts';
      const { createProviderFactory, waitForSync } = await import(runtimePath);
      const { provider, doc } = await createProviderFactory()(docId, new Map());
      const { provider: peer } = await createProviderFactory()(docId, new Map());
      window.__collaborationLifecycle = { provider, peer, doc, restores: 0 };
      window.addEventListener('pageshow', (event) => {
        if (event.persisted) window.__collaborationLifecycle!.restores += 1;
      });
      if (phase === 'pending') {
        const originalFetch = window.fetch;
        let tokenRequested!: () => void;
        const requested = new Promise<void>((resolve) => { tokenRequested = resolve; });
        window.fetch = (input, init) => {
          const request = new Request(input, init);
          if (!new URL(request.url).pathname.endsWith('/sync-tokens')) return originalFetch(request);
          window.fetch = originalFetch;
          tokenRequested();
          return new Promise<Response>((_resolve, reject) => {
            request.signal.addEventListener('abort', () => reject(new DOMException('Page departed', 'AbortError')));
          });
        };
        void provider.connect();
        void peer.connect();
        await requested;
      } else {
        await Promise.all([provider.connect(), peer.connect()]);
      }
      doc.getMap('lifecycle').set('value', 'before departure');
      if (phase === 'connected') await waitForSync(provider);
    }, { docId: id, phase });

    await page.goto('/icon-192.png');
    // A cached document fires pageshow again, not another load event.
    await page.goBack({ waitUntil: 'commit' });
    const cacheDiagnostics = await page.evaluate(() => JSON.stringify(performance.getEntriesByType('navigation')[0]));
    await expect.poll(() => page.evaluate(() => window.__collaborationLifecycle?.restores), {
      message: `Expected a retained page, navigation diagnostics: ${cacheDiagnostics}`,
    }).toBe(1);
    expect(await page.evaluate(() => window.__collaborationLifecycle!.doc.getMap('lifecycle').get('value')))
      .toBe('before departure');
    await page.evaluate(async () => {
      const runtimePath = '/src/collaboration/runtime.ts';
      const { waitForSync } = await import(runtimePath);
      const { provider, peer, doc } = window.__collaborationLifecycle!;
      await Promise.all([waitForSync(provider), waitForSync(peer)]);
      doc.getMap('lifecycle').set('value', 'after restoration');
      await waitForSync(provider);
    });
    expect(await page.evaluate(() => ({
      status: window.__collaborationLifecycle!.provider.status,
      peerStatus: window.__collaborationLifecycle!.peer.status,
      pending: window.__collaborationLifecycle!.provider.hasLocalChanges,
    }))).toEqual({ status: 'connected', peerStatus: 'connected', pending: false });
  });
}

test('cancels a native socket handshake and restores without a browser warning', async ({ page }) => {
  const { id } = await createUserDocument(page, 'Handshake departure');
  await openLifecycleFixture(page);
  const result = await page.evaluate(async (docId) => {
    const NativeWebSocket = window.WebSocket;
    const sockets: WebSocket[] = [];
    const sentBy: WebSocket[] = [];
    let wasConnecting = false;
    let departedSocketClosed!: Promise<void>;
    window.WebSocket = class extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        sockets.push(this);
        if (sockets.length === 1) {
          departedSocketClosed = new Promise((resolve) => this.addEventListener('close', () => resolve(), { once: true }));
          // Run after the provider binds the socket, before its native open event.
          queueMicrotask(() => {
            wasConnecting = this.readyState === NativeWebSocket.CONNECTING;
            window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
            window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
          });
        }
      }
      override send(data: Parameters<WebSocket['send']>[0]) {
        sentBy.push(this);
        super.send(data);
      }
    };
    const runtimePath = '/src/collaboration/runtime.ts';
    const { createProviderFactory, waitForSync } = await import(runtimePath);
    const { provider, doc } = await createProviderFactory()(docId, new Map());
    try {
      await provider.connect();
      await waitForSync(provider);
      await departedSocketClosed;
      doc.getMap('lifecycle').set('value', 'after handshake cancellation');
      await waitForSync(provider);
      return {
        wasConnecting,
        sockets: sockets.length,
        departedClosed: sockets[0]!.readyState === NativeWebSocket.CLOSED,
        departedSent: sentBy.includes(sockets[0]!),
        status: provider.status,
        pending: provider.hasLocalChanges,
      };
    } finally {
      provider.destroy();
      doc.destroy();
      window.WebSocket = NativeWebSocket;
    }
  }, id);
  expect(result).toEqual({
    wasConnecting: true,
    sockets: 2,
    departedClosed: true,
    departedSent: false,
    status: 'connected',
    pending: false,
  });
});
