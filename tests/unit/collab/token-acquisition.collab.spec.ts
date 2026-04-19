import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDocumentTokenApiPath } from '@/routing';
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

  it('requests document tokens only through the RemDo API endpoint', async () => {
    const requests: RecordedRequest[] = [];
    const originalFetch = globalThis.fetch.bind(globalThis);
    const docId = 'tokenroute';

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = new Request(input, init);
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
            url: expect.stringContaining(createDocumentTokenApiPath(docId)),
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
});
