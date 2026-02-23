import { attachPageGuards, expect, test } from '#e2e/fixtures';
import { createUniqueNoteId } from '#lib/editor/note-ids';
import type { Page } from '@playwright/test';
import {
  allowOfflineDisconnectedConsoleIssue,
  cleanupOfflineTest,
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

    let offlinePage: Page | undefined;
    let detachOfflineGuards: (() => void) | undefined;
    await context.setOffline(true);
    try {
      offlinePage = await context.newPage();
      detachOfflineGuards = attachPageGuards(offlinePage);
      allowOfflineDisconnectedConsoleIssue(offlinePage);
      await offlinePage.goto(`/n/${warmedDocId}`);
      await expect(offlinePage.getByRole('link', { name: 'RemDo' })).toBeVisible();
      await expect(offlinePage.locator('.document-editor-shell')).toBeVisible();
      await expect(offlinePage.locator('.editor-container')).toBeVisible();
    } finally {
      await cleanupOfflineTest(context, offlinePage, detachOfflineGuards);
    }
  });

  test('shows offline empty state for a document without local cache', async ({ page, context }) => {
    const warmedDocId = createUniqueNoteId();
    await page.goto(`/n/${warmedDocId}`);
    await loginThroughTinyauthIfNeeded(page);
    await waitForServiceWorkerControl(page);
    allowOfflineDisconnectedConsoleIssue(page);
    await page.close();

    let offlinePage: Page | undefined;
    let detachOfflineGuards: (() => void) | undefined;
    await context.setOffline(true);
    try {
      const uncachedDocId = createUniqueNoteId();
      offlinePage = await context.newPage();
      detachOfflineGuards = attachPageGuards(offlinePage);
      allowOfflineDisconnectedConsoleIssue(offlinePage);
      await offlinePage.goto(`/n/${uncachedDocId}`);
      await expect(offlinePage.locator('.editor-offline-empty-state')).toBeVisible();
      await expect(
        offlinePage.getByText("You're offline. This document has no local copy yet.")
      ).toBeVisible();
      await expect(offlinePage.locator('.editor-input')).toHaveCount(0);
    } finally {
      await cleanupOfflineTest(context, offlinePage, detachOfflineGuards);
    }
  });

  test('reopens a cached document offline, accepts edits, and reconnects', async ({ page, context }) => {
    const docId = createUniqueNoteId();
    const onlineSeedText = `online-seed-${docId.slice(0, 8)}`;
    const offlineEditText = `offline-edit-${docId.slice(0, 8)}`;

    await page.goto(`/n/${docId}`);
    await loginThroughTinyauthIfNeeded(page);
    const editorInput = page.locator('.editor-input').first();
    await editorInput.waitFor({ state: 'visible' });
    await editorInput.click();
    await page.keyboard.type(onlineSeedText);
    await expect(page.locator('li.list-item').filter({ hasText: onlineSeedText })).toHaveCount(1);
    await waitForServiceWorkerControl(page);
    await expect(page.locator('li.list-item').filter({ hasText: onlineSeedText })).toHaveCount(1);
    allowOfflineDisconnectedConsoleIssue(page);
    await page.close();

    let offlinePage: Page | undefined;
    let detachOfflineGuards: (() => void) | undefined;
    await context.setOffline(true);
    try {
      offlinePage = await context.newPage();
      detachOfflineGuards = attachPageGuards(offlinePage);
      allowOfflineDisconnectedConsoleIssue(offlinePage);
      await offlinePage.goto(`/n/${docId}`);
      const offlineEditorInput = offlinePage.locator('.editor-input').first();
      await expect(offlineEditorInput).toBeVisible();
      await expect(offlinePage.locator('li.list-item').filter({ hasText: onlineSeedText })).toHaveCount(1);

      await offlineEditorInput.click();
      await offlinePage.keyboard.press('Enter');
      await offlinePage.keyboard.type(offlineEditText);
      await expect(offlinePage.locator('li.list-item').filter({ hasText: offlineEditText })).toHaveCount(1);

      await context.setOffline(false);
      await expect(offlinePage.locator('.collab-status')).toHaveAttribute('aria-label', /Server connected/i);
      await expect(offlinePage.locator('li.list-item').filter({ hasText: offlineEditText })).toHaveCount(1);
    } finally {
      await cleanupOfflineTest(context, offlinePage, detachOfflineGuards);
    }
  });
});
