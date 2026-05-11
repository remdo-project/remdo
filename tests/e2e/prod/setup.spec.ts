import { expect, test } from '#e2e/fixtures';
import { createDocumentPath, DEFAULT_DOC_ID } from '@/routing';
import { PROD_TEST_ADMIN_SECRET, PROD_TEST_AUTH } from './_support/helpers';

test('admin provisioning creates a user and opens the editor', async ({ page }) => {
  await page.goto(createDocumentPath(DEFAULT_DOC_ID));

  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByRole('link', { name: 'Open admin provisioning' }).click();
  await expect(page.getByRole('heading', { name: 'Create user' })).toBeVisible();
  await page.fill('input[autocomplete="current-password"]', PROD_TEST_ADMIN_SECRET);
  await page.fill('input[autocomplete="name"]', PROD_TEST_AUTH.name);
  await page.fill('input[autocomplete="email"]', PROD_TEST_AUTH.email);
  await page.fill('input[autocomplete="new-password"]', PROD_TEST_AUTH.password);
  await page.click('button[type="submit"]');

  await page.waitForURL(/\/n\//);
  await expect(page.locator('.document-editor-shell')).toBeVisible();
  await expect(page.locator('.editor-input').first()).toHaveAttribute('contenteditable', 'true');
});
