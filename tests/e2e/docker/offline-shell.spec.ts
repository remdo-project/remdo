import { expect, unauthenticatedTest as test } from '#e2e/fixtures';
import { allowServerUnavailableConsoleIssue } from './_support/helpers';

test('preserves the requested route during an API outage and retries through Django sign-in', async ({ page, context }) => {
  allowServerUnavailableConsoleIssue(page);
  await context.route('**/api/**', (route) => route.abort());
  await page.goto('/n/offlineDoc');
  await expect(page).toHaveURL(/\/n\/offlineDoc$/u);
  await expect(page.getByRole('heading', { name: 'Connection unavailable' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'RemDo home', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link')).toHaveCount(0);

  await context.unroute('**/api/**');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByLabel('Email:', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/accounts\/login\//u);
  expect(new URL(new URL(page.url()).searchParams.get('next')!, page.url()).searchParams.get('next')).toBe('/n/offlineDoc');
});

test('registers no offline entry without a signed-in session', async ({ page, context }) => {
  allowServerUnavailableConsoleIssue(page);
  await context.route('**/api/**', (route) => route.abort());
  await page.goto('/n/offlineDoc');
  await expect(page.getByRole('heading', { name: 'Connection unavailable' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
});
