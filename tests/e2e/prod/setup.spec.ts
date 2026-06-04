import { expect, test } from '#e2e/fixtures';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createUserDocument } from '../_support/documents';
import {
  PROD_TEST_ADMIN_SECRET,
  PROD_TEST_AUTH,
  waitForEditableEditor,
  waitForServiceWorkerControl,
} from './_support/helpers';

test('admin provisioning creates a user and opens the editor', async ({ page }) => {
  await page.goto('/home');

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
  await waitForEditableEditor(page);

  await page.goto('/home');
  await page.waitForURL(/\/n\//u);
  await waitForEditableEditor(page);
  await expect(page.locator('.collab-status')).toHaveAttribute('aria-label', /Server connected/i);
  await waitForServiceWorkerControl(page);
  await waitForEditableEditor(page);

  const smokeDocument = await createUserDocument(page, 'Docker Smoke');
  // eslint-disable-next-line node/no-process-env -- Docker prod setup shares the created smoke document id.
  const smokeDocumentIdPath = process.env.E2E_WRITE_SMOKE_DOCUMENT_ID;
  if (smokeDocumentIdPath) {
    fs.mkdirSync(path.dirname(smokeDocumentIdPath), { recursive: true });
    fs.writeFileSync(smokeDocumentIdPath, `${smokeDocument.id}\n`, 'utf8');
  }

  // eslint-disable-next-line node/no-process-env -- Docker prod setup writes auth state for the remaining prod specs.
  const storageStatePath = process.env.E2E_WRITE_STORAGE_STATE;
  if (storageStatePath) {
    await page.context().storageState({ path: storageStatePath });
  }
});
