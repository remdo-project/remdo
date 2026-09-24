import { expect, test } from '#editor/fixtures';

test.describe('Admin link', () => {
  test('an admin opens the admin panel from a server-rendered page, not the app header', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
    const navigation = page.getByRole('navigation', { name: 'Primary' });
    await expect(navigation.getByRole('link')).toHaveText(['About', 'Logout']);

    await navigation.getByRole('link', { name: 'About', exact: true }).click();
    await navigation.getByRole('link', { name: 'Admin', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/$/u);
    await expect(page.getByRole('heading', { name: 'Site administration', exact: true })).toBeVisible();
  });
});
