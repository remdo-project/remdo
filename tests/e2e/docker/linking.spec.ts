import { expect, setExpectedConsoleIssues, test } from '#e2e/fixtures';
import type { Page } from '#e2e/fixtures';
import { config } from '#config';
import { STABLE_AUTH_USERS } from '#tools/stable-auth-users';
import { waitForEditableEditor } from './_support/helpers';

const sourceOrigin = `http://localhost:${config.env.PORT}`;
const homeOrigin = config.env.APP_PUBLIC_URL;
const SOURCE_SERVER_ID = 'source';

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

test('links a source account and opens its Home document from the Docker home switcher', async ({ page }) => {
  setExpectedConsoleIssues(page, ['Failed to get client token'], { mode: 'allowContains' });

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

  await page.goto('/home');
  await expect.poll(() => new URL(page.url()).pathname).toMatch(/^\/n\/[\dA-Za-z]+$/u);
  const homePathname = new URL(page.url()).pathname;

  const switcherTrigger = page.getByRole('button', { name: 'Choose document' });
  await expect(switcherTrigger).toBeVisible();
  await switcherTrigger.click();

  const dropdown = page.locator('.document-header-doc-dropdown');
  await expect(dropdown.locator('[data-document-source-id="local"]')).toContainText('Current Server');
  const sourceGroup = dropdown.locator(`[data-document-source-id="${SOURCE_SERVER_ID}"]`);
  await expect(sourceGroup).toContainText('Local dev server');
  await sourceGroup.getByRole('option', { name: 'Home', exact: true }).click();

  await expect.poll(() => new URL(page.url()).pathname).toMatch(/^\/n\/[\dA-Za-z]+$/u);
  expect(new URL(page.url()).pathname).not.toBe(homePathname);
  await waitForEditableEditor(page);
  await expect(page.locator('.collab-status')).toHaveAttribute('aria-label', /Server connected/i);
});
