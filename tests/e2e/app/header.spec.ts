import { expect, test } from '#e2e/fixtures';

test('header controls are reachable by keyboard on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeFocused();

  for (const control of await page.getByRole('banner').locator('a, button').all()) {
    await control.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(control).toBeFocused();
  }
});
