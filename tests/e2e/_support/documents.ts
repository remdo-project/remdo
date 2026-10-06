import type { Page } from '@playwright/test';
import type { UserDocument } from '#domain/documents/user-data';
import type { components } from '#platform/http/api-schema';
import { expect } from '@playwright/test';

async function fetchWriteHeaders(page: Page) {
  // A pooled connection the gateway closed during an idle gap resets on reuse;
  // the GET is idempotent, so retrying that reset is safe.
  const config = await page.request.get('/api/config', { failOnStatusCode: true, maxRetries: 3 });
  const { csrfToken } = await config.json() as components['schemas']['Config'];
  return { 'X-CSRFToken': csrfToken, Origin: new URL(config.url()).origin };
}

export async function createUserDocument(page: Page, title: string): Promise<UserDocument> {
  const response = await page.request.post('/api/documents', {
    headers: await fetchWriteHeaders(page),
    data: { title },
  });
  await expect(response).toBeOK();
  return response.json() as Promise<UserDocument>;
}

export async function shareUserDocument(page: Page, documentId: string, email: string): Promise<void> {
  const response = await page.request.post(`/api/documents/${documentId}/access`, {
    headers: await fetchWriteHeaders(page),
    data: { email },
  });
  await expect(response).toBeOK();
}

export async function expectCollaborationDenied(page: Page, documentId: string): Promise<void> {
  const outcome = await page.evaluate(async (docId) => {
    const runtimePath = '/src/collaboration/runtime.ts';
    const { createProviderFactory, waitForSync } = await import(runtimePath);
    const { provider, doc } = createProviderFactory()(docId, new Map());
    const synchronized = waitForSync(provider);
    void provider.connect();
    try {
      await synchronized;
      return 'unexpectedly synchronized';
    } catch {
      return provider.status;
    } finally {
      provider.destroy();
      doc.destroy();
    }
  }, documentId);
  expect(outcome).toBe('error');
}
