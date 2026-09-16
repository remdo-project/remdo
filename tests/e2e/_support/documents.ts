import type { Page } from '@playwright/test';
import type { UserDocument } from '#domain/documents/user-data';
import type { components } from '#platform/http/api-schema';
import { expect } from '@playwright/test';

export async function createUserDocument(page: Page, title: string): Promise<UserDocument> {
  const config = await page.request.get('/api/config', { failOnStatusCode: true });
  const { csrfToken } = await config.json() as components['schemas']['Config'];
  const response = await page.request.post('/api/documents', {
    headers: { 'X-CSRFToken': csrfToken },
    data: { title },
  });
  await expect(response).toBeOK();
  return response.json() as Promise<UserDocument>;
}
