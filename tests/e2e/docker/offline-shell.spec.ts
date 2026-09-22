import { expect, unauthenticatedTest as test } from '#e2e/fixtures';
import {
  allowServerUnavailableConsoleIssue,
  waitForServiceWorkerControl,
  withOfflinePage,
} from './_support/helpers';

test('preserves the requested route during an API outage and retries through Django sign-in', async ({ page, context }) => {
  allowServerUnavailableConsoleIssue(page);
  await context.route('**/api/**', (route) => route.abort());
  await page.goto('/n/offlineDoc');
  await expect(page).toHaveURL(/\/n\/offlineDoc$/u);
  await expect(page.getByRole('heading', { name: 'Connection unavailable' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'RemDo home', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', {
    name: /^(?:Admin|Logout|Sign in)$/u,
  })).toHaveCount(0);

  await context.unroute('**/api/**');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByLabel('Email:', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/accounts\/login\//u);
  expect(new URL(new URL(page.url()).searchParams.get('next')!, page.url()).searchParams.get('next')).toBe('/n/offlineDoc');
});

test('revalidates an offline shell without a remembered session when connectivity returns', async ({ page, context }) => {
  // Warm the app shell without a session; a normal online visit redirects to Django.
  allowServerUnavailableConsoleIssue(page);
  await context.route('**/api/**', (route) => route.abort());
  await page.goto('/n/offlineDoc');
  await expect(page.getByRole('heading', { name: 'Connection unavailable' })).toBeVisible();
  await waitForServiceWorkerControl(page);
  await page.close();
  await context.unroute('**/api/**');

  await withOfflinePage(context, async (offline) => {
    await offline.goto('/n/offlineDoc');
    await expect(offline).toHaveURL(/\/n\/offlineDoc$/u);
    await expect(offline.getByRole('heading', { name: 'Connection unavailable' })).toBeVisible();
    await expect(offline.locator('.editor-input')).toHaveCount(0);

    await context.setOffline(false);
    await expect(offline.getByLabel('Email:', { exact: true })).toBeVisible();
    await expect(offline).toHaveURL(/\/accounts\/login\//u);
    expect(new URL(new URL(offline.url()).searchParams.get('next')!, offline.url()).searchParams.get('next')).toBe('/n/offlineDoc');
  });
});
