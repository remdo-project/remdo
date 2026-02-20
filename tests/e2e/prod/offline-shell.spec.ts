import { expect, test } from '#e2e/fixtures';
import { createUniqueNoteId } from '#lib/editor/note-ids';
import {
  allowOfflineDisconnectedConsoleIssue,
  loginThroughTinyauthIfNeeded,
  waitForServiceWorkerControl,
} from './_support/helpers';

test.describe('Offline app shell', () => {
  test('opens the app shell while offline after an online warm-up', async ({ page, context }) => {
    const warmedDocId = createUniqueNoteId();
    await page.goto(`/n/${warmedDocId}`);
    await loginThroughTinyauthIfNeeded(page);
    await expect(page.locator('.document-editor-shell')).toBeVisible();
    await waitForServiceWorkerControl(page);
    allowOfflineDisconnectedConsoleIssue(page);
    await page.close();

    await context.setOffline(true);
    try {
      const offlinePage = await context.newPage();
      allowOfflineDisconnectedConsoleIssue(offlinePage);
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
    await loginThroughTinyauthIfNeeded(page);
    await waitForServiceWorkerControl(page);
    allowOfflineDisconnectedConsoleIssue(page);
    await page.close();

    await context.setOffline(true);
    try {
      const uncachedDocId = createUniqueNoteId();
      const offlinePage = await context.newPage();
      allowOfflineDisconnectedConsoleIssue(offlinePage);
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
