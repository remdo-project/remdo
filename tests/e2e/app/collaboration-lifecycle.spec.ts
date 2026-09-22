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

test('restores collaboration connections from the browser back-forward cache', async ({ page }) => {
    const { id } = await createUserDocument(page, 'Cache restoration');
    await openLifecycleFixture(page);
    await page.evaluate(async (docId) => {
      const runtimePath = '/src/collaboration/runtime.ts';
      const { createProviderFactory, waitForSync } = await import(runtimePath);
      const { provider, doc } = createProviderFactory({ accountId: 'lifecycle-test-account' })(docId, new Map());
      const { provider: peer } = createProviderFactory({ accountId: 'lifecycle-test-account' })(docId, new Map());
      window.__collaborationLifecycle = { provider, peer, doc, restores: 0 };
      window.addEventListener('pageshow', (event) => {
        if (event.persisted) window.__collaborationLifecycle!.restores += 1;
      });
      provider.connect();
      peer.connect();
      await Promise.all([waitForSync(provider), waitForSync(peer)]);
      doc.getMap('lifecycle').set('value', 'before departure');
      await waitForSync(provider);
    }, id);

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
    const { provider, doc } = createProviderFactory({ accountId: 'lifecycle-test-account' })(docId, new Map());
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

test('reconnects a native browser socket after a temporary authorization outage', async ({ page }) => {
  const { id } = await createUserDocument(page, 'Authorization recovery');
  await openLifecycleFixture(page);
  const result = await page.evaluate(async (docId) => {
    const runtimePath = '/src/collaboration/runtime.ts';
    const { createProviderFactory, waitForSync } = await import(runtimePath);
    const { provider, doc } = createProviderFactory()(docId, new Map());
    try {
      await provider.connect();
      await waitForSync(provider);
      const closed = new Promise<void>((resolve) => provider.on('connection-close', () => resolve()));
      provider.emit('authenticationFailed', { reason: 'collaboration.service-unavailable' });
      await closed;
      doc.getMap('recovery').set('value', 'written during reconnect');
      await waitForSync(provider);
      const peer = createProviderFactory()(docId, new Map());
      try {
        await peer.provider.connect();
        await waitForSync(peer.provider);
        return {
          status: provider.status,
          pending: provider.hasLocalChanges,
          content: peer.doc.getMap('recovery').get('value'),
        };
      } finally {
        peer.provider.destroy();
        peer.doc.destroy();
      }
    } finally {
      provider.destroy();
      doc.destroy();
    }
  }, id);
  expect(result).toEqual({ status: 'connected', pending: false, content: 'written during reconnect' });
});

test('keeps offline edits unsaved until reconnect acknowledges the complete document', async ({ page }) => {
  const { id } = await createUserDocument(page, 'Reconnect acknowledgement');
  await openLifecycleFixture(page);
  const result = await page.evaluate(async (docId) => {
    const runtimePath = '/src/collaboration/runtime.ts';
    const sessionPath = '/src/collaboration/session.ts';
    const { createProviderFactory, waitForSync } = await import(runtimePath);
    const { CollabSession } = await import(sessionPath);
    const NativeWebSocket = WebSocket;
    let reconnecting = false;
    let blocked = false;
    let sentIncremental = false;
    const held: Array<() => void> = [];
    let receivedServerReply!: () => void;
    const serverReply = new Promise<void>((resolve) => { receivedServerReply = resolve; });
    const messageType = (data: ArrayBuffer | Uint8Array) => {
      const bytes = new Uint8Array(data);
      let offset = 0;
      const readUint = () => {
        let value = 0;
        let shift = 0;
        let byte: number;
        do {
          byte = bytes[offset++]!;
          value += (byte & 127) * 2 ** shift;
          shift += 7;
        } while (byte & 128);
        return value;
      };
      const nameLength = readUint();
      offset += nameLength;
      const type = readUint();
      return { type, subtype: type === 0 ? readUint() : -1 };
    };
    class OrderedSocket extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        this.addEventListener('message', (event) => {
          if (!reconnecting) return;
          const { type, subtype } = messageType(event.data);
          // Run after the provider processes this server message. Old queued
          // increments produce an early ack; full sync only gets server Step2.
          if ((sentIncremental && type === 8) || (!sentIncremental && type === 0 && subtype === 1)) {
            setTimeout(receivedServerReply, 0);
          }
        });
      }
      override send(data: Parameters<WebSocket['send']>[0]) {
        if (reconnecting) {
          const { type, subtype } = messageType(data as Uint8Array);
          if (blocked || (type === 0 && subtype === 1)) {
            blocked = true;
            held.push(() => super.send(data));
            return;
          }
          if (type === 0 && subtype === 2) {
            sentIncremental = true;
            blocked = true;
          }
        }
        super.send(data);
      }
    }
    const connection = createProviderFactory({ WebSocketPolyfill: OrderedSocket })(docId, new Map());
    const { provider, doc } = connection;
    const session = new CollabSession({ enabled: true, docId, providerFactory: () => connection });
    session.attach(new Map());
    try {
      await provider.connect();
      await waitForSync(provider);
      doc.getMap('content').set('remove', 'previously saved');
      await waitForSync(provider);
      provider.disconnect();
      doc.getMap('content').set('one', 1);
      doc.getMap('content').set('two', 2);
      doc.getMap('content').delete('remove');
      reconnecting = true;
      void provider.connect();
      await serverReply;
      const before = session.snapshot().hasLocalChanges;
      const peer = createProviderFactory()(docId, new Map());
      try {
        await peer.provider.connect();
        await waitForSync(peer.provider);
        const beforeContent = peer.doc.getMap('content').toJSON();
        const received = new Promise<void>((resolve) => {
          peer.doc.on('update', () => {
            const content = peer.doc.getMap('content');
            if (content.get('two') === 2 && !content.has('remove')) resolve();
          });
        });
        reconnecting = false;
        for (const send of held) send();
        await Promise.all([received, waitForSync(provider)]);
        return { before, beforeContent, after: session.snapshot().hasLocalChanges, content: peer.doc.getMap('content').toJSON() };
      } finally {
        peer.provider.destroy();
        peer.doc.destroy();
      }
    } finally {
      session.destroy();
      doc.destroy();
    }
  }, id);
  expect(result).toMatchObject({
    before: true,
    beforeContent: { remove: 'previously saved' },
    after: false,
    content: { one: 1, two: 2 },
  });
});
