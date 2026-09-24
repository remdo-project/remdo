import { expect, test } from '#e2e/fixtures';
import { ensureReady } from '../editor/_support/bridge';

test('owner deletes a document from its Home row after confirming', async ({ page }) => {
  await page.goto('/');
  const currentServer = page.getByRole('group', { name: 'Current Server', exact: true });
  await currentServer.getByRole('button', { name: 'New Document', exact: true }).click();
  await expect(page).toHaveURL(/\/n\/[A-Za-z0-9]+$/u);
  const docId = new URL(page.url()).pathname.slice(3);
  await ensureReady(page);
  await page.goto('/');

  const row = currentServer.locator(`[data-home-document-ref="${docId}"]`).locator('..');
  await row.hover();
  await row.getByRole('button', { name: /^Actions for/u }).click();
  await page.getByRole('menuitem', { name: 'Delete…' }).click();
  const dialog = page.getByRole('dialog', { name: /^Delete/u });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(row).toBeVisible();

  await row.hover();
  await row.getByRole('button', { name: /^Actions for/u }).click();
  await page.getByRole('menuitem', { name: 'Delete…' }).click();
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator(`[data-home-document-ref="${docId}"]`)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeFocused();
  const listing = await page.request.get('/api/documents');
  expect((await listing.json() as Array<{ id: string }>).map((document) => document.id)).not.toContain(docId);
});
