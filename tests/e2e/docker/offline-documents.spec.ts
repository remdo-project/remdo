/* eslint-disable node/no-process-env */
import { execFileSync } from 'node:child_process';
import type { Page } from '@playwright/test';
import { expect, guardedTest as test, withPageGuards } from '#e2e/fixtures';
import { createUserDocument } from '../_support/documents';
import {
  allowOfflineDisconnectedConsoleIssue,
  waitForEditableEditor,
  waitForServiceWorkerControl,
  withOfflinePage,
} from './_support/helpers';

const password = 'offline-fixture-password-1234';
let ownerEmail: string;
let otherEmail: string;

async function signIn(page: Page, email = ownerEmail) {
  await page.goto('/accounts/login/?next=/');
  await page.getByLabel('Email:', { exact: true }).fill(email);
  await page.getByLabel('Password:', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  // Account bootstrap must finish before a fresh offline page can remember it.
  await expect.poll(() => page.evaluate(() => localStorage.getItem('remdo-current-user-bootstrap'))).not.toBeNull();
}

async function warmDocument(page: Page, title: string) {
  const document = await createUserDocument(page, title);
  await page.goto(`/n/${document.id}`);
  await waitForEditableEditor(page);
  await page.locator('.editor-input').click();
  await page.keyboard.type(title);
  await expect(page.locator('.collab-status')).toHaveAttribute('aria-label', /Saved to server.*Server connected/u);
  await waitForServiceWorkerControl(page);
  await expect(page.locator('.editor-input')).toContainText(title);
  await expect(page.locator('.collab-status')).toHaveAttribute('aria-label', /Saved to server.*Server connected/u);
  return document.id;
}

test.beforeAll(async ({ request }, workerInfo) => {
  ownerEmail = `offline-owner-${workerInfo.workerIndex}@example.test`;
  otherEmail = `offline-other-${workerInfo.workerIndex}@example.test`;
  await expect.poll(async () => {
    try { return (await request.get('/health')).status(); } catch { return 0; }
  }, { timeout: 30_000 }).toBe(200);
  for (const email of [ownerEmail, otherEmail]) {
    execFileSync('docker', ['exec', '-e', `DJANGO_SUPERUSER_PASSWORD=${password}`,
      process.env.DOCKER_TEST_CONTAINER!, 'python', 'manage.py',
      'createsuperuser', '--noinput', '--email', email], { stdio: 'pipe' });
  }
});

test('reopens persisted content offline and delivers offline edits after reconnect', async ({ page, context, browser }, testInfo) => {
  await signIn(page);
  const docId = await warmDocument(page, 'Offline persisted document');
  allowOfflineDisconnectedConsoleIssue(page);
  await page.close();

  await withOfflinePage(context, async (offline) => {
    await offline.goto(`/n/${docId}`);
    await waitForEditableEditor(offline);
    await expect(offline.locator('.editor-input')).toContainText('Offline persisted document');
    const unsaved = offline.getByText('Unsaved · syncs when reconnected');
    await expect(unsaved).toHaveCount(0);
    await offline.locator('.editor-input').click();
    await offline.keyboard.press('ControlOrMeta+End');
    await offline.keyboard.type(' with offline edits');
    await expect(unsaved).toBeVisible();
    // A second offline page proves the asynchronous local write completed.
    await withPageGuards(await context.newPage(), async (localReader) => {
      allowOfflineDisconnectedConsoleIssue(localReader);
      await localReader.goto(`/n/${docId}`);
      await expect(localReader.locator('.editor-input')).toContainText('with offline edits');
      await localReader.close();
    }, testInfo);
    await offline.reload();
    await expect(offline.locator('.editor-input')).toContainText('with offline edits');
    // Otherwise reconnecting reports the edits saved before the handshake sends them.
    await expect(unsaved).toBeVisible();
    await context.setOffline(false);
    await expect(offline.locator('.collab-status')).toHaveAttribute('aria-label', /Saved to server.*Server connected/u);
    await expect(unsaved).toHaveCount(0);
  });

  // A new browser context can obtain these edits only from the server.
  const fresh = await browser.newContext({ baseURL: process.env.DOCKER_TEST_ORIGIN!, ignoreHTTPSErrors: true });
  try {
    await withPageGuards(await fresh.newPage(), async (reopened) => {
      await signIn(reopened);
      await reopened.goto(`/n/${docId}`);
      await expect(reopened.locator('.editor-input')).toContainText('Offline persisted document with offline edits');
    }, testInfo);
  } finally {
    await fresh.close();
  }
});

test('offline logout discards edits across tabs and isolates the next account', async ({ page, context }, testInfo) => {
  await signIn(page);
  const docId = await warmDocument(page, 'Owner private content');
  const peer = await context.newPage();
  await withPageGuards(peer, async () => {
    await peer.goto('/');
    await expect(peer.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
    allowOfflineDisconnectedConsoleIssue(page);
    allowOfflineDisconnectedConsoleIssue(peer);
    await context.setOffline(true);
    try {
      await page.reload();
      await waitForEditableEditor(page);
      await page.locator('.editor-input').click();
      await page.keyboard.type(' discard this edit');
      await expect(page.getByText('Unsaved · syncs when reconnected')).toBeVisible();
      await page.getByRole('button', { name: 'Logout', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(page.locator('.editor-input')).toContainText('discard this edit');
      await page.getByRole('button', { name: 'Logout', exact: true }).click();
      await page.getByRole('button', { name: 'Sign out and discard', exact: true }).click();
      await expect(page.getByText('Sign-out incomplete', { exact: true })).toBeVisible();
      await expect(peer.getByText('Sign-out incomplete', { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.locator('.editor-input')).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
    // Reconnect and reload cannot silently finish logout or restore the session.
    await page.reload();
    await expect(page.getByText('Local data cleared. Signing in finishes signing out first.')).toBeVisible();
    expect((await context.request.get('/api/auth/browser/v1/auth/session')).status()).toBe(200);
    // Signing in revokes first, so the peer observes confirmation and the server
    // rejects the old cookie before any credential form is reached.
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(peer.getByText("You're signed out", { exact: true })).toBeVisible();
    await expect.poll(async () => (await context.request.get('/api/auth/browser/v1/auth/session')).status()).toBe(401);
    // That click navigates to the credential form; let it land before the next
    // sign-in issues its own navigation to the same route.
    await page.waitForURL(/\/accounts\/login\//u);
    await expect(page.getByLabel('Email:', { exact: true })).toBeVisible();
  }, testInfo);
  await peer.close();

  await signIn(page, otherEmail);
  // The starter document proves this account's listing rendered; bootstrap alone
  // completes before it, which would make the absence check vacuous.
  await expect(
    page.getByRole('group', { name: 'Current Server', exact: true })
      .getByRole('button', { name: 'New Document', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Owner private content', exact: true })).toHaveCount(0);
  await page.close();
  await withOfflinePage(context, async (offline) => {
    await offline.goto(`/n/${docId}`);
    await expect(offline.locator('.editor-offline-empty-state')).toBeVisible();
    await expect(offline.locator('.editor-input')).toHaveCount(0);
    await expect(offline.getByText('Owner private content', { exact: true })).toHaveCount(0);
  });
});

test('native admin logout clears cached content and peer editors before another account signs in', async ({ page, context }, testInfo) => {
  await signIn(page);
  const title = 'Admin owner private content';
  const docId = await warmDocument(page, title);
  allowOfflineDisconnectedConsoleIssue(page);
  // Establish that the old account's content really is readable from this cache.
  await withOfflinePage(context, async (offline) => {
    await offline.goto(`/n/${docId}`);
    await expect(offline.locator('.editor-input')).toContainText(title);
  });

  const peer = await context.newPage();
  await withPageGuards(peer, async () => {
    await peer.goto(`/n/${docId}`);
    await expect(peer.locator('.editor-input')).toContainText(title);
    await expect(peer.locator('.collab-status')).toHaveAttribute('aria-label', /Saved to server.*Server connected/u);
    await page.getByRole('link', { name: 'Admin', exact: true }).click();
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sign out of RemDo?' })).toBeVisible();
    expect((await context.request.get('/api/auth/browser/v1/auth/session')).status()).toBe(200);

    // A closed dirty tab's mark must be honored even from native administration.
    await page.evaluate(() => localStorage.setItem('remdo-unsynced:document:closed-tab', '1'));
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(peer.locator('.editor-input')).toContainText(title);
    expect((await context.request.get('/api/auth/browser/v1/auth/session')).status()).toBe(200);

    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out and discard', exact: true }).click();
    await expect(page.getByText("You're signed out", { exact: true })).toBeVisible();
    await expect(peer.getByText("You're signed out", { exact: true })).toBeVisible();
    await expect(peer.locator('.editor-input')).toHaveCount(0);
    expect((await context.request.get('/api/auth/browser/v1/auth/session')).status()).toBe(401);
  }, testInfo);
  await peer.close();

  await signIn(page, otherEmail);
  await expect(
    page.getByRole('group', { name: 'Current Server', exact: true })
      .getByRole('button', { name: 'New Document', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: title, exact: true })).toHaveCount(0);
  await page.close();
  await withOfflinePage(context, async (offline) => {
    await offline.goto(`/n/${docId}`);
    await expect(offline.locator('.editor-offline-empty-state')).toBeVisible();
    await expect(offline.locator('.editor-input')).toHaveCount(0);
    await expect(offline.getByText(title, { exact: true })).toHaveCount(0);
  });
});

test('keeps an uncached document non-editable offline and loads its content on reconnect', async ({ page, browser }, testInfo) => {
  await signIn(page);
  const docId = await warmDocument(page, 'Content to recover');
  const fresh = await browser.newContext({ baseURL: process.env.DOCKER_TEST_ORIGIN!, ignoreHTTPSErrors: true });
  try {
    // Warm only Home in a second browser: this document has never been cached there.
    await withPageGuards(await fresh.newPage(), async (home) => {
      await signIn(home);
      await waitForServiceWorkerControl(home);
      await home.close();
    }, testInfo);
    await withOfflinePage(fresh, async (offline) => {
      await offline.goto(`/n/${docId}`);
      await expect(offline).toHaveURL(new RegExp(`/n/${docId}$`, 'u'));
      await expect(offline.getByText("This document isn't available offline yet.")).toBeVisible();
      await expect(offline.locator('.editor-input')).toHaveCount(0);
      await fresh.setOffline(false);
      await expect(offline.locator('.editor-input')).toContainText('Content to recover');
      await expect(offline.locator('.editor-input')).toHaveAttribute('contenteditable', 'true');
      await expect(offline.locator('.editor-offline-empty-state')).toHaveCount(0);
    });
  } finally {
    await fresh.close();
  }
});
