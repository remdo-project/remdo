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

describe('browser error reporting', () => {
  it('reports caught render errors through the instance origin without query strings', async () => {
    history.replaceState(null, '', '/n/previous-id?code=private-query-value');
    const { reporting, sent } = await startWithConfiguredDsn('https://publickey@ingest.example/7');
    history.pushState(null, '', '/n/document-id?code=private-query-value#private-fragment');

    await reporting.reportRenderError(new Error('render failure'), '\n    at NoteBody');

    await vi.waitFor(() => expect(sent).toHaveLength(1));
    const [{ path, body }] = sent as [SentRequest];
    const [, , item] = body.split('\n');
    expect(path).toBe('/api/error-reports');
    expect(JSON.parse(item!)).toMatchObject({
      exception: { values: [{ type: 'Error', value: 'render failure' }] },
      request: { url: `${location.origin}/n/document-id`, headers: { 'User-Agent': navigator.userAgent } },
      contexts: { react: { componentStack: '\n    at NoteBody' } },
      breadcrumbs: [{ category: 'navigation', data: { from: '/n/previous-id', to: '/n/document-id' } }],
    });
    expect(body).not.toContain('private-');
  });

  it('loads no reporter when the instance leaves reporting disabled', async () => {
    const { reporting, sent } = await startWithConfiguredDsn('');

    await reporting.reportRenderError(new Error('render failure'), undefined);

    expect(sent).toEqual([]);
  });
});
