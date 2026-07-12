import { attachPageGuards, expect, test } from '#e2e/fixtures';
import { createUniqueNoteId } from '#domain/notes/ids';
import type { Page } from '@playwright/test';
import { createUserDocument } from '../_support/documents';
import {
  allowOfflineDisconnectedConsoleIssue,
  allowServerUnavailableConsoleIssue,
  cleanupOfflineTest,
  waitForEditableEditor,
  waitForServiceWorkerControl,
} from './_support/helpers';

test.describe('Offline app shell', () => {
  test('opens the cached bootstrap home route while offline', async ({ page, context }) => {
    await page.goto('/');
    const homePath = new URL(page.url()).pathname;
    await waitForServiceWorkerControl(page);
    await waitForEditableEditor(page);
    allowOfflineDisconnectedConsoleIssue(page);
    await page.close();

    let offlinePage: Page | undefined;
    let detachOfflineGuards: (() => void) | undefined;
    await context.setOffline(true);
    try {
      offlinePage = await context.newPage();
      detachOfflineGuards = attachPageGuards(offlinePage);
      allowOfflineDisconnectedConsoleIssue(offlinePage);
      await offlinePage.goto('/');
      await expect.poll(() => new URL(offlinePage!.url()).pathname).toBe(homePath);
      await expect(offlinePage.locator('.document-editor-shell')).toBeVisible();
    } finally {
      await cleanupOfflineTest(context, offlinePage, detachOfflineGuards);
    }
  });

  test('opens the cached bootstrap home route when the API server is unavailable', async ({ page, context }) => {
    await page.goto('/');
    const homePath = new URL(page.url()).pathname;
    await waitForServiceWorkerControl(page);
    await waitForEditableEditor(page);
    allowServerUnavailableConsoleIssue(page);
    await page.close();

    let unavailablePage: Page | undefined;
    let detachUnavailableGuards: (() => void) | undefined;
    await context.route('**/api/**', (route) => {
      void route.abort();
    });
    try {
      unavailablePage = await context.newPage();
      detachUnavailableGuards = attachPageGuards(unavailablePage);
      allowServerUnavailableConsoleIssue(unavailablePage);
      await unavailablePage.goto('/');
      await expect.poll(() => new URL(unavailablePage!.url()).pathname).toBe(homePath);
      await expect(unavailablePage.locator('.document-editor-shell')).toBeVisible();
    } finally {
      await context.unroute('**/api/**');
      await cleanupOfflineTest(context, unavailablePage, detachUnavailableGuards);
    }
  });

  test('keeps the signed-out route while the app server is unavailable and retries in place', async ({
    browser,
    contextOptions,
  }) => {
    const context = await browser.newContext({
      ...contextOptions,
      storageState: {
        cookies: [],
        origins: [],
      },
    });
    const unavailablePage = await context.newPage();
    let detachUnavailableGuards: (() => void) | undefined;

    try {
      detachUnavailableGuards = attachPageGuards(unavailablePage);
      allowServerUnavailableConsoleIssue(unavailablePage);
      await context.route('**/api/**', (route) => {
        void route.abort();
      });
      await unavailablePage.goto('/');

      await expect.poll(() => new URL(unavailablePage.url()).pathname).toBe('/');
      expect(new URL(unavailablePage.url()).search).toBe('');
      await expect(unavailablePage.getByRole('heading', { name: 'Connection unavailable' })).toBeVisible();
      await expect(unavailablePage.getByRole('link', { name: 'RemDo' })).toBeVisible();
      const navigation = unavailablePage.getByRole('navigation', { name: 'Primary' });
      await expect(navigation.getByRole('link', {
        name: /^(?:Admin|Sharing|Logout|Sign in)$/u,
      })).toHaveCount(0);

      await context.unroute('**/api/**');
      await unavailablePage.getByRole('button', { name: 'Retry' }).click();
      await expect(unavailablePage.getByRole('heading', { name: 'Sign in' })).toBeVisible();
      await expect.poll(() => new URL(unavailablePage.url()).pathname).toBe('/');
    } finally {
      await context.unroute('**/api/**');
      await cleanupOfflineTest(context, unavailablePage, detachUnavailableGuards);
      await context.close();
    }
  });

  test('revalidates the preserved route when browser connectivity returns', async ({
    browser,
    contextOptions,
  }) => {
    const context = await browser.newContext({
      ...contextOptions,
      storageState: {
        cookies: [],
        origins: [],
      },
    });
    const warmupPage = await context.newPage();
    let detachWarmupGuards: (() => void) | undefined;
    let offlinePage: Page | undefined;
    let detachOfflineGuards: (() => void) | undefined;

    try {
      detachWarmupGuards = attachPageGuards(warmupPage);
      await warmupPage.goto('/');
      await waitForServiceWorkerControl(warmupPage);
      detachWarmupGuards();
      detachWarmupGuards = undefined;
      await warmupPage.close();

      await context.setOffline(true);
      offlinePage = await context.newPage();
      detachOfflineGuards = attachPageGuards(offlinePage);
      allowOfflineDisconnectedConsoleIssue(offlinePage);
      await offlinePage.goto('/sharing');

      await expect.poll(() => new URL(offlinePage!.url()).pathname).toBe('/sharing');
      await expect(offlinePage.getByRole('heading', { name: 'Connection unavailable' })).toBeVisible();

      await context.setOffline(false);
      await expect(offlinePage.getByRole('heading', { name: 'Sign in' })).toBeVisible();
      await expect.poll(() => new URL(offlinePage!.url()).pathname).toBe('/');
      await expect.poll(() => new URL(offlinePage!.url()).searchParams.get('next')).toBe('/sharing');
    } finally {
      if (detachWarmupGuards) {
        detachWarmupGuards();
      }
      await cleanupOfflineTest(context, offlinePage, detachOfflineGuards);
      await context.close();
    }
  });

  test('opens the app shell while offline after an online warm-up', async ({ page, context }) => {
    const { id: warmedDocId } = await createUserDocument(page, 'Offline Warmed Document');
    await page.goto(`/n/${warmedDocId}`);
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
    const { id: warmedDocId } = await createUserDocument(page, 'Offline Shell Cache Warmup');
    await page.goto(`/n/${warmedDocId}`);
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
    const { id: docId } = await createUserDocument(page, 'Offline Cached Document');
    const onlineSeedText = `online-seed-${docId.slice(0, 8)}`;
    const offlineEditText = `offline-edit-${docId.slice(0, 8)}`;

    await page.goto(`/n/${docId}`);
    await waitForEditableEditor(page);
    const editorInput = page.locator('.editor-input').first();
    await editorInput.click();
    await page.keyboard.type(onlineSeedText);
    await expect(page.locator('li.list-item').filter({ hasText: onlineSeedText })).toHaveCount(1);
    await waitForServiceWorkerControl(page);
    await waitForEditableEditor(page);
    await expect(page.locator('.collab-status')).toHaveAttribute('aria-label', /Server connected/i);
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
      await waitForEditableEditor(offlinePage);
      const offlineEditorInput = offlinePage.locator('.editor-input').first();
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
