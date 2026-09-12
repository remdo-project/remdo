import { MantineProvider } from '@mantine/core';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDocumentSyncTokenApiPath } from '#document-routes';
import { getCollabTestSessionCookie, withSessionCookie } from './_support/auth';
import { ensureCollabTestDocument } from './_support/documents';
import { renderRemdoEditor } from './_support/render-editor';
import { TestEditorView } from './_support/test-editor-view';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';

interface RecordedRequest {
  method: string;
  url: string;
}

describe('collaboration token acquisition', { timeout: COLLAB_LONG_TIMEOUT_MS }, () => {
  afterEach(() => {
    if (vi.isMockFunction(globalThis.WebSocket)) globalThis.WebSocket.mockRestore();
    if (vi.isMockFunction(globalThis.fetch)) vi.mocked(globalThis.fetch).mockRestore();
  });

  it('requests Y-Sweet document client tokens only through the RemDo API endpoint', async () => {
    const requests: RecordedRequest[] = [];
    const originalFetch = globalThis.fetch.bind(globalThis);
    const docId = 'tokenroute';
    const sessionCookie = await getCollabTestSessionCookie();

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = withSessionCookie(input, init, sessionCookie);
      requests.push({
        method: request.method,
        url: request.url,
      });
      return originalFetch(request);
    });

    const { unmount } = await renderRemdoEditor(docId);

    try {
      expect(requests).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: 'POST',
            url: expect.stringContaining(createDocumentSyncTokenApiPath(docId)),
          }),
        ])
      );
      expect(requests).toEqual(
        expect.not.arrayContaining([
          expect.objectContaining({ url: expect.stringContaining('/doc/new') }),
          expect.objectContaining({ url: expect.stringMatching(/\/doc\/[^/]+\/auth(?:$|[?#])/u) }),
        ])
      );
    } finally {
      unmount();
    }
  });

  it('does not warn when a token fetch fails after teardown mid-connect', async () => {
    // Destroying this session invalidates its connect attempt without aborting
    // a token request that another live provider may share.
    const docId = 'tokenabort';
    await ensureCollabTestDocument(docId);
    const sessionCookie = await getCollabTestSessionCookie();
    const warnSpy = vi.mocked(console.warn);

    const originalFetch = globalThis.fetch.bind(globalThis);
    const tokenPath = createDocumentSyncTokenApiPath(docId);
    // Fail the pending request after teardown. The patched client must ignore
    // the rejection belonging to the destroyed provider's connection attempt.
    let failTokenRequest: (() => void) | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const request = withSessionCookie(input, init, sessionCookie);
      if (request.url.includes(tokenPath)) {
        return new Promise<Response>((_resolve, reject) => {
          failTokenRequest = () => reject(new TypeError('Failed to fetch'));
        });
      }
      return originalFetch(request);
    });

    const { unmount } = render(
      <MantineProvider>
        <TestEditorView docId={docId} />
      </MantineProvider>
    );

    // Let the connect loop issue the (hanging) token request, tear down, then
    // fail the in-flight request as a cancelled navigation would.
    await vi.waitFor(() => expect(failTokenRequest).toBeDefined());
    unmount();
    failTokenRequest?.();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(
      warnSpy.mock.calls.some((args) => String(args[0]).includes('Failed to get client token'))
    ).toBe(false);
  });

  it('does not open a websocket when a token fetch resolves after teardown', async () => {
    // The mirror of the abort case: if the in-flight token fetch *succeeds* just
    // after destroy(), y-sweet must not resume and open a WebSocket (resurrecting
    // a torn-down connection). The patched client ignores the departed attempt.
    const docId = 'tokenlateok';
    await ensureCollabTestDocument(docId);
    const sessionCookie = await getCollabTestSessionCookie();

    const RealWebSocket = globalThis.WebSocket;
    const wsUrls: string[] = [];
    vi.spyOn(globalThis, 'WebSocket').mockImplementation((url, protocols) => {
      wsUrls.push(String(url));
      return new RealWebSocket(url, protocols);
    });

    const originalFetch = globalThis.fetch.bind(globalThis);
    const tokenPath = createDocumentSyncTokenApiPath(docId);
    // Hold the token request until we release it *successfully*, after teardown.
    let resolveTokenRequest: (() => void) | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = withSessionCookie(input, init, sessionCookie);
      if (request.url.includes(tokenPath)) {
        // Fetch the real token once released, so the resolved value is valid.
        await new Promise<void>((resolve) => {
          resolveTokenRequest = resolve;
        });
        return originalFetch(request);
      }
      return originalFetch(request);
    });

    const { unmount } = render(
      <MantineProvider>
        <TestEditorView docId={docId} />
      </MantineProvider>
    );

    await vi.waitFor(() => expect(resolveTokenRequest).toBeDefined());
    const wsBeforeTeardown = wsUrls.length;
    unmount();
    resolveTokenRequest?.();
    await new Promise((resolve) => setTimeout(resolve, 100));

    // No new WebSocket after teardown — the late-successful token was not used.
    expect(wsUrls.length).toBe(wsBeforeTeardown);
  });
});
