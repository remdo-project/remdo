import { expect, test } from '#e2e/fixtures';

test('a workspace opens from Home as its document, saves, renames and deletes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New workspace', exact: true }).click();
  const create = page.getByRole('dialog', { name: 'New workspace' });
  await create.getByRole('textbox', { name: 'Workspace name' }).fill('Lisbon trip');
  await create.getByRole('button', { name: 'Create workspace' }).click();

  await expect(page.getByRole('heading', { name: 'Lisbon trip', level: 1 })).toBeVisible();
  const text = page.getByRole('textbox', { name: 'Lisbon trip Markdown' });
  await expect(text).toHaveValue('');
  await text.fill('- Flights\n');
  await expect(page.getByRole('status').filter({ hasText: 'Unsaved changes' })).toBeVisible();
  await text.press('ControlOrMeta+s');
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();

  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('button', { name: 'Home' }).click();
  const currentServer = page.getByRole('group', { name: 'Current Server', exact: true });
  await currentServer.getByRole('button', { name: 'Lisbon trip', exact: true }).click();
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
  const call = async (operations: object[], expected: object = {}) => {
    const response = await page.request.post('/api/notes', { data: { operations, expected, dryRun: false } });
    expect(response.ok()).toBe(true);
    return await response.json() as { results: Array<{ ref: string }>; changes: Array<{ ref: string; version?: string }> };
  };
  await page.goto('/');
  const currentServer = page.getByRole('group', { name: 'Current Server', exact: true });
  await expect(page.getByRole('button', { name: 'New workspace', exact: true })).toBeVisible();

  const created = await call([{ op: 'insert', parent: 'me', kind: 'workspace', text: 'From an agent', content: '- a\n' }]);
  await currentServer.getByRole('button', { name: 'From an agent', exact: true }).click();
  const text = page.getByRole('textbox', { name: 'From an agent Markdown' });
  await expect(text).toHaveValue('- a\n');

  const readme = `${created.results[0]!.ref}/README.md`;
  const version = created.changes.find((change) => change.ref === readme)!.version;
  await call([{ op: 'setContent', target: readme, content: '- a\n- b\n' }], { [readme]: version });
  await expect(text).toHaveValue('- a\n- b\n');
});
