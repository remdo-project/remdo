import { act, Component, createElement } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

interface SentRequest {
  path: string;
  body: string;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

async function startWithConfiguredDsn(errorReportingDsn: string) {
  vi.resetModules();
  const sent: SentRequest[] = [];
  const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.origin);
    if (url.pathname === '/api/config') {
      return Response.json({ csrfCookieName: 'remdo_csrf', buildRevision: '', csrfToken: 'token', errorReportingDsn });
    }
    sent.push({ path: url.pathname, body: String(init!.body) });
    return new Response(null, { status: 200 });
  });
  // The reporter sends through the page's native fetch, which it recognizes by
  // this source text, rather than through instrumented replacements.
  fetchStub.toString = () => 'function fetch() { [native code] }';
  vi.stubGlobal('fetch', fetchStub);
  const reporting = await import('./error-reporting');
  await reporting.startErrorReporting();
  return { reporting, sent };
}

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

function NoteBody(): never {
  throw new Error('render failure');
}

async function renderCaughtFailure(rootOptions: Parameters<typeof createRoot>[1]) {
  const root = createRoot(document.createElement('div'), rootOptions);
  await act(async () => root.render(createElement(Boundary, null, createElement(NoteBody))));
  root.unmount();
  // React's default handler logs caught errors, and the reporting handler keeps that.
  expect(console.error).toHaveBeenCalledWith(expect.objectContaining({ message: 'render failure' }));
  vi.mocked(console.error).mockClear();
}

function reportedEvent({ body }: SentRequest) {
  const [, , item] = body.split('\n');
  return JSON.parse(item!) as unknown;
}

describe('browser error reporting', () => {
  it('reports caught and uncaught errors through the instance origin without query strings', async () => {
    history.replaceState(null, '', '/n/previous-id?code=private-query-value');
    const { reporting, sent } = await startWithConfiguredDsn('https://publickey@ingest.example/7');
    history.pushState(null, '', '/n/document-id?code=private-query-value#private-fragment');

    await renderCaughtFailure(reporting.errorReportingRootOptions);

    await vi.waitFor(() => expect(sent).toHaveLength(1));
    const [request] = sent as [SentRequest];
    expect(request.path).toBe('/api/error-reports');
    const event = reportedEvent(request) as { request: { headers: unknown } };
    expect(event.request.headers).toEqual({ 'User-Agent': navigator.userAgent });
    expect(event).toMatchObject({
      exception: { values: [{ type: 'Error', value: 'render failure' }] },
      request: { url: `${location.origin}/n/document-id` },
      contexts: { react: { componentStack: expect.stringContaining('NoteBody') } },
      breadcrumbs: [{ category: 'navigation', data: { from: '/n/previous-id', to: '/n/document-id' } }],
    });
    expect(request.body).not.toContain('private-');

    // The browser's global error hook, called directly: a dispatched error event
    // would also reach the test runner's own unhandled-error listener.
    // Without an error object, the report's only frame is named by the page URL.
    window.onerror!('uncaught failure', location.href, 1, 1);

    await vi.waitFor(() => expect(sent).toHaveLength(2));
    expect(reportedEvent(sent[1]!)).toMatchObject({
      exception: { values: [{
        value: 'uncaught failure',
        mechanism: { handled: false },
        stacktrace: { frames: [{ filename: `${location.origin}/n/document-id` }] },
      }] },
    });
    expect(sent[1]!.body).not.toContain('private-');
  });

  it('leaves the session unreported when the reporter fails to load', async () => {
    vi.doMock('./error-reporter', () => {
      throw new Error('reporter chunk unavailable');
    });
    try {
      const { reporting, sent } = await startWithConfiguredDsn('https://publickey@ingest.example/7');

      await renderCaughtFailure(reporting.errorReportingRootOptions);

      expect(sent).toEqual([]);
    } finally {
      vi.doUnmock('./error-reporter');
    }
  });

  it('loads no reporter when the instance leaves reporting disabled', async () => {
    const { reporting, sent } = await startWithConfiguredDsn('');

    await renderCaughtFailure(reporting.errorReportingRootOptions);

    expect(sent).toEqual([]);
  });
});
