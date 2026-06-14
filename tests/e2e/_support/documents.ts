import type { Page } from '@playwright/test';
import type { UserDocument } from '#domain/documents/user-data';
import { expect } from '@playwright/test';

export async function createUserDocument(page: Page, title: string): Promise<UserDocument> {
  const response = await page.request.post('/api/documents', {
    data: { title },
  });
  await expect(response).toBeOK();
  return response.json() as Promise<UserDocument>;
}
