import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

interface UserDocumentResponse {
  id: string;
  title: string;
}

export async function createUserDocument(page: Page, title: string): Promise<UserDocumentResponse> {
  const response = await page.request.post('/api/documents', {
    data: { title },
  });
  await expect(response).toBeOK();
  return response.json() as Promise<UserDocumentResponse>;
}
