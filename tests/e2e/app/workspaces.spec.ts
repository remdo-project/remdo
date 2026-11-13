import type { Page } from '@playwright/test';
import { expect, test } from '#e2e/fixtures';
import type { components } from '#platform/http/api-schema';

const showMarkdown = (page: Page) => page.getByText('Markdown', { exact: true }).click();

async function call(
  page: Page,
  operations: Array<components['schemas']['OperationRequest']>,
  expected: Record<string, string | null> = {},
) {
  const response = await page.request.post('/api/notes', { data: { operations, expected, dryRun: false } });
  await expect(response).toBeOK();
  return await response.json() as components['schemas']['CallResult'];
}

test('a workspace opens from Home as its document, saves, renames and deletes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New workspace', exact: true }).click();
  const create = page.getByRole('dialog', { name: 'New workspace' });
  await create.getByRole('textbox', { name: 'Workspace name' }).fill('Lisbon trip');
  await create.getByRole('button', { name: 'Create workspace' }).click();

  await expect(page.getByRole('heading', { name: 'Lisbon trip', level: 1 })).toBeVisible();
  await showMarkdown(page);
  const text = page.getByRole('textbox', { name: 'Lisbon trip Markdown' });
  await expect(text).toHaveValue('');
  await text.fill('- Flights\n');
  await expect(page.getByRole('status').filter({ hasText: 'Unsaved changes' })).toBeVisible();
  await text.press('ControlOrMeta+s');
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();

  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('button', { name: 'Home' }).click();
  const currentServer = page.getByRole('group', { name: 'Current Server', exact: true });
  await currentServer.getByRole('button', { name: 'Lisbon trip', exact: true }).click();
  await showMarkdown(page);
  await expect(text).toHaveValue('- Flights\n');

  await page.getByRole('button', { name: 'Actions for Lisbon trip' }).click();
  await page.getByRole('menuitem', { name: 'Rename…' }).click();
  const rename = page.getByRole('dialog', { name: 'Rename document' });
  await rename.getByRole('textbox').fill('Lisbon 2027');
  await rename.getByRole('button', { name: 'Rename' }).click();
  await expect(page.getByRole('heading', { name: 'Lisbon 2027', level: 1 })).toBeVisible();

  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('button', { name: 'Home' }).click();
  const row = currentServer.getByRole('listitem').filter({ hasText: 'Lisbon 2027' });
  await row.hover();
  await row.getByRole('button', { name: 'Actions for Lisbon 2027' }).click();
  await page.getByRole('menuitem', { name: 'Delete…' }).click();
  await page.getByRole('dialog', { name: 'Delete “Lisbon 2027”?' }).getByRole('button', { name: 'Delete' }).click();

  await expect(currentServer.getByRole('button', { name: 'Lisbon 2027' })).toHaveCount(0);
  const account = await (await page.request.get('/api/notes/me')).json() as { children: unknown[] };
  expect(account.children).toEqual([]);
});

test('Home and an open workspace follow changes made elsewhere', async ({ page }) => {
  await page.goto('/');
  const currentServer = page.getByRole('group', { name: 'Current Server', exact: true });
  await expect(page.getByRole('button', { name: 'New workspace', exact: true })).toBeVisible();

  const created = await call(page, [{ op: 'insert', parent: 'me', kind: 'workspace', text: 'From an agent', content: '- a\n' }]);
  await currentServer.getByRole('button', { name: 'From an agent', exact: true }).click();
  await showMarkdown(page);
  const text = page.getByRole('textbox', { name: 'From an agent Markdown' });
  await expect(text).toHaveValue('- a\n');

  const readme = `${String(created.results[0]!.ref)}/README.md`;
  const version = created.changes.find((change) => change.ref === readme)!.version ?? null;
  await call(page, [{ op: 'setContent', target: readme, content: '- a\n- b\n' }], { [readme]: version });
  await expect(text).toHaveValue('- a\n- b\n');
});

test('a workspace document opens as a read-only outline of its Markdown', async ({ page }) => {
  await call(page, [{
    op: 'insert', parent: 'me', kind: 'workspace', text: 'Outline',
    content: '# Trip\n\nFour days.\n\n1. Alfama\n2. Belém\n- [x] Book flights\n',
  }]);
  await page.goto('/');
  await page.getByRole('group', { name: 'Current Server', exact: true }).getByRole('button', { name: 'Outline', exact: true }).click();

  const outline = page.getByRole('textbox', { name: 'Outline' });
  await expect(outline).toHaveAttribute('contenteditable', 'false');
  const note = (text: string) => outline.locator('li.list-item:not(.list-nested-item)').filter({ hasText: text }).first();
  await expect(note('Trip')).toHaveAttribute('data-heading-level', '1');
  await expect(note('Four days.')).toHaveAttribute('data-marker', 'block');
  await expect(note('Alfama')).toHaveAttribute('data-number', '1');
  await expect(note('Belém')).toHaveAttribute('data-number', '2');
  await expect(note('Book flights')).toHaveAttribute('data-checkbox', 'true');
  await expect(note('Book flights')).toHaveAttribute('data-note-checked', 'true');
});
