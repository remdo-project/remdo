import { attachPageGuards, expect, test } from '#e2e/fixtures';
import { createUniqueNoteId } from '#domain/notes/ids';
import type { Page } from '@playwright/test';
import { createUserDocument } from '../_support/documents';
import {
  allowOfflineDisconnectedConsoleIssue,
  allowServerUnavailableConsoleIssue,
  cleanupOfflineTest,
  withOfflinePage,
  waitForEditableEditor,
  waitForServiceWorkerControl,
} from './_support/helpers';

const unauthenticatedTest = test.extend({
  storageState: {
    cookies: [],
    origins: [],
  },
});

test.describe('Offline app shell', () => {
  test('opens the cached bootstrap home route while offline', async ({ page, context }) => {
    await page.goto('/');
    const homePath = new URL(page.url()).pathname;
    await waitForServiceWorkerControl(page);
    await waitForEditableEditor(page);
    allowOfflineDisconnectedConsoleIssue(page);
    await page.close();

    await withOfflinePage(context, async (offlinePage) => {
      await offlinePage.goto('/');
      await expect.poll(() => new URL(offlinePage.url()).pathname).toBe(homePath);
      await expect(offlinePage.locator('.document-editor-shell')).toBeVisible();
    });
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

  unauthenticatedTest(
    'keeps the signed-out route while the app server is unavailable and retries in place',
    async ({ page, context }) => {
      const userDataRequests: string[] = [];
      page.on('request', (request) => {
        if (new URL(request.url()).pathname === '/api/current-user') {
          userDataRequests.push(request.url());
        }
      });
      allowServerUnavailableConsoleIssue(page);
      await context.route('**/api/**', (route) => {
        void route.abort();
      });
      try {
        await page.goto('/');

        await expect.poll(() => new URL(page.url()).pathname).toBe('/');
        expect(new URL(page.url()).search).toBe('');
        await expect(page.getByRole('heading', { name: 'Connection unavailable' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'RemDo' })).toBeVisible();
        const navigation = page.getByRole('navigation', { name: 'Primary' });
        await expect(navigation.getByRole('link', {
          name: /^(?:Admin|Sharing|Logout|Sign in)$/u,
        })).toHaveCount(0);
        expect(userDataRequests).toEqual([]);

        await context.unroute('**/api/**');
        await page.getByRole('button', { name: 'Retry' }).click();
        await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
        await expect.poll(() => new URL(page.url()).pathname).toBe('/');
      } finally {
        await context.unroute('**/api/**');
      }
    },
  );

  unauthenticatedTest('revalidates the preserved route when browser connectivity returns', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await waitForServiceWorkerControl(page);
    await page.close();

    await withOfflinePage(context, async (offlinePage) => {
      await offlinePage.goto('/sharing');

      await expect.poll(() => new URL(offlinePage.url()).pathname).toBe('/sharing');
      await expect(offlinePage.getByRole('heading', { name: 'Connection unavailable' })).toBeVisible();

      await context.setOffline(false);
      await expect(offlinePage.getByRole('heading', { name: 'Sign in' })).toBeVisible();
      await expect.poll(() => new URL(offlinePage.url()).pathname).toBe('/');
      await expect.poll(() => new URL(offlinePage.url()).searchParams.get('next')).toBe('/sharing');
    });
  });

  test('withholds consent actions until the authenticated session can be revalidated', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await waitForServiceWorkerControl(page);
    allowOfflineDisconnectedConsoleIssue(page);
    await page.close();

    await withOfflinePage(context, async (offlinePage) => {
      await offlinePage.goto('/oauth/consent?client_id=test-client');

      await expect.poll(() => new URL(offlinePage.url()).pathname).toBe('/oauth/consent');
      await expect(offlinePage.getByRole('heading', { name: 'Connection unavailable' })).toBeVisible();
      await expect(offlinePage.getByRole('button', { name: /^(?:Allow|Deny)$/u })).toHaveCount(0);

      await context.setOffline(false);
      await expect(offlinePage.getByRole('heading', { name: 'Authorize access' })).toBeVisible();
      await expect.poll(() => new URL(offlinePage.url()).pathname).toBe('/oauth/consent');
      expect(new URL(offlinePage.url()).searchParams.get('client_id')).toBe('test-client');
    });
  });

  test('withholds admin actions until the authenticated session can be revalidated', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await waitForServiceWorkerControl(page);
    allowOfflineDisconnectedConsoleIssue(page);
    await page.close();

    await withOfflinePage(context, async (offlinePage) => {
      await offlinePage.goto('/admin');

      await expect.poll(() => new URL(offlinePage.url()).pathname).toBe('/admin');
      await expect(offlinePage.getByRole('heading', { name: 'Connection unavailable' })).toBeVisible();
      await expect(offlinePage.getByRole('heading', { name: /^(?:Admin|Become admin)$/u })).toHaveCount(0);
    });
  });

  test('opens the app shell while offline after an online warm-up', async ({ page, context }) => {
    const { id: warmedDocId } = await createUserDocument(page, 'Offline Warmed Document');
    await page.goto(`/n/${warmedDocId}`);
    await expect(page.locator('.document-editor-shell')).toBeVisible();
    await waitForServiceWorkerControl(page);
    allowOfflineDisconnectedConsoleIssue(page);
    await page.close();

    await withOfflinePage(context, async (offlinePage) => {
      await offlinePage.goto(`/n/${warmedDocId}`);
      await expect(offlinePage.getByRole('link', { name: 'RemDo' })).toBeVisible();
      await expect(offlinePage.locator('.document-editor-shell')).toBeVisible();
      await expect(offlinePage.locator('.editor-container')).toBeVisible();
    });
  });

  test('shows offline empty state for a document without local cache', async ({ page, context }) => {
    const { id: warmedDocId } = await createUserDocument(page, 'Offline Shell Cache Warmup');
    await page.goto(`/n/${warmedDocId}`);
    await waitForServiceWorkerControl(page);
    allowOfflineDisconnectedConsoleIssue(page);
    await page.close();

    await withOfflinePage(context, async (offlinePage) => {
      const uncachedDocId = createUniqueNoteId();
      await offlinePage.goto(`/n/${uncachedDocId}`);
      await expect(offlinePage.locator('.editor-offline-empty-state')).toBeVisible();
      await expect(
        offlinePage.getByText("You're offline. This document has no local copy yet.")
      ).toBeVisible();
      await expect(offlinePage.locator('.editor-input')).toHaveCount(0);
    });
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

    await withOfflinePage(context, async (offlinePage) => {
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
    });
  });
});
