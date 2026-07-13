import { MantineProvider } from '@mantine/core';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Editor from '#client/editor/Editor';
import { EditorViewProvider } from '#client/editor/view/EditorViewProvider';
import { createDocumentSyncTokenApiPath } from '#document-routes';
import { getCollabTestSessionCookie, withSessionCookie } from './_support/auth';
import { ensureCollabTestDocument } from './_support/documents';
import { renderRemdoEditor } from './_support/render-editor';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';

interface RecordedRequest {
  method: string;
  url: string;
}

describe('collaboration token acquisition', { timeout: COLLAB_LONG_TIMEOUT_MS }, () => {
  afterEach(() => {
    vi.restoreAllMocks();
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

  it('does not warn when a token fetch is aborted by teardown mid-connect', async () => {
    // Navigating away unmounts the editor while the token fetch is in flight;
    // the session aborts that fetch on destroy. y-sweet warns on any token
    // failure, so this asserts the benign teardown abort stays silent (the flake
    // behind the admin-link e2e console-guard failure).
    const docId = 'tokenabort';
    await ensureCollabTestDocument(docId);
    const sessionCookie = await getCollabTestSessionCookie();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const originalFetch = globalThis.fetch.bind(globalThis);
    const tokenPath = createDocumentSyncTokenApiPath(docId);
    // Hold the token request in flight until we release it, and fail it the way
    // a navigation-cancelled fetch does — after teardown. The runtime aborts the
    // request on destroy; y-sweet warns on any token rejection, so the fix must
    // keep this teardown failure silent.
    let failTokenRequest: (() => void) | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const request = withSessionCookie(input, init, sessionCookie);
      if (request.url.includes(tokenPath)) {
        return new Promise<Response>((_resolve, reject) => {
          const fail = () => reject(new TypeError('Failed to fetch'));
          failTokenRequest = fail;
          request.signal.addEventListener('abort', fail);
        });
      }
      return originalFetch(request);
    });

    const { unmount } = render(
      <MantineProvider>
        <EditorViewProvider docId={docId}>
          <Editor docId={docId} statusPortalRoot={null} />
        </EditorViewProvider>
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

  it('adds the session cookie to relative API requests', () => {
    const request = withSessionCookie(
      createDocumentSyncTokenApiPath('tokenroute'),
      { method: 'POST' },
      'better-auth.session_token=test-session',
    );

    expect(request.url).toContain(createDocumentSyncTokenApiPath('tokenroute'));
    expect(request.headers.get('cookie')).toBe('better-auth.session_token=test-session');
    expect(request.method).toBe('POST');
  });
});
