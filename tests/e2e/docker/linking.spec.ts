import { expect, test } from '#e2e/fixtures';
import type { Page } from '#e2e/fixtures';
import { config } from '#config';
import { STABLE_AUTH_USERS } from '#tools/stable-auth-users';

const sourceOrigin = `http://localhost:${config.env.PORT}`;
const homeOrigin = config.env.APP_PUBLIC_URL;

type StableUser = (typeof STABLE_AUTH_USERS)[keyof typeof STABLE_AUTH_USERS];

function buildUrl(origin: string, path: string): string {
  return new URL(path, origin).toString();
}

async function signInWithVisibleForm(page: Page, user: StableUser): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByLabel('Email').fill(user.email);
  await page.getByRole('textbox', { name: 'Password' }).fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function expectPageUrl(page: Page, expected: { origin: string; pathname: string }): Promise<void> {
  await expect.poll(() => {
    const url = new URL(page.url());
    return {
      origin: url.origin,
      pathname: url.pathname,
    };
  }).toEqual(expected);
}

test('links a source account from the Docker home sharing page', async ({ page }) => {
  await page.goto('/sharing');

  await expect(page).toHaveURL(buildUrl(homeOrigin, '/sharing'));
  await expect(page.getByText('Remote RemDo servers')).toBeVisible();
  await expect(page.getByText('Local dev server')).toBeVisible();
  await expect(page.getByText(sourceOrigin)).toBeVisible();
  await expect(page.getByText(/tokenBaseUrl/u)).toBeHidden();
  await page.getByRole('button', { name: 'Link' }).click();

  await expectPageUrl(page, { origin: sourceOrigin, pathname: '/login' });
  await signInWithVisibleForm(page, STABLE_AUTH_USERS.bob);

  await expect(page).toHaveURL(buildUrl(homeOrigin, '/sharing'));
  await expect(page.getByRole('button', { name: 'Linked' })).toBeVisible();
});
