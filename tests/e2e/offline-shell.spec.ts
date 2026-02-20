import { expect, test } from '#e2e/fixtures';
import type { Page } from '#e2e/fixtures';
import { createUniqueNoteId } from '#lib/editor/note-ids';

async function waitForServiceWorkerControl(page: Page): Promise<void> {
  await page.waitForFunction(() => 'serviceWorker' in navigator);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

test.describe('Offline app shell', () => {
  test('opens the app shell while offline after an online warm-up', async ({ page, context }) => {
    const warmedDocId = createUniqueNoteId();
    await page.goto(`/n/${warmedDocId}`);
    await expect(page.locator('.document-editor-shell')).toBeVisible();
    await waitForServiceWorkerControl(page);

    await context.setOffline(true);
    try {
      const offlinePage = await context.newPage();
      await offlinePage.goto(`/n/${warmedDocId}`);
      await expect(offlinePage.getByRole('link', { name: 'RemDo' })).toBeVisible();
      await expect(offlinePage.locator('.document-editor-shell')).toBeVisible();
      await expect(offlinePage.locator('.editor-container')).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });

  test('shows offline empty state for a document without local cache', async ({ page, context }) => {
    const warmedDocId = createUniqueNoteId();
    await page.goto(`/n/${warmedDocId}`);
    await waitForServiceWorkerControl(page);

    await context.setOffline(true);
    try {
      const uncachedDocId = createUniqueNoteId();
      const offlinePage = await context.newPage();
      await offlinePage.goto(`/n/${uncachedDocId}`);
      await expect(offlinePage.locator('.editor-offline-empty-state')).toBeVisible();
      await expect(
        offlinePage.getByText("You're offline. This document has no local copy yet.")
      ).toBeVisible();
      await expect(offlinePage.locator('.editor-input')).toHaveCount(0);
    } finally {
      await context.setOffline(false);
    }
  });
});
