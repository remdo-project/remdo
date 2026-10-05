import { expect, isolatedTest as test } from '#editor/fixtures';
import { editorLocator, homeSearch, homeView, homeZoomBreadcrumb, openDocumentFromHome } from '#editor/locators';
import { ensureReady, load, waitForSynced } from './_support/bridge';
import { createEditorDocumentPath } from './_support/routes';
import { createUserDocument } from '../_support/documents';

test.describe('Home', () => {
  test('keeps one row action visible through hover, keyboard and overlays', async ({ page, editor }) => {
    await editor.load('basic');
    await createUserDocument(page, 'Another document');
    await homeZoomBreadcrumb(page).click();
    const home = homeView(page);
    const rows = home.getByRole('listitem');
    await expect(rows).toHaveCount(3);
    const first = rows.nth(0).getByRole('button', { name: /^Actions for/u });
    const second = rows.nth(1).getByRole('button', { name: /^Actions for/u });
    const secondLink = rows.nth(1).locator('[data-home-document-ref]');
    const before = (await secondLink.boundingBox())!;
    await page.mouse.move(0, 0);
    await expect(first).toHaveCSS('opacity', '1');
    await expect(second).toHaveCSS('opacity', '0');

    await secondLink.hover();
    await home.getByRole('heading', { name: 'Home', level: 1 }).hover();
    await expect(first).toHaveCSS('opacity', '0');
    await expect(second).toHaveCSS('opacity', '1');
    expect((await secondLink.boundingBox())!.x).toBe(before.x);

    const firstBox = (await rows.nth(0).boundingBox())!;
    await second.click();
    await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
    await expect(first).toHaveCSS('opacity', '0');
    await expect(second).toHaveCSS('opacity', '1');
    await page.keyboard.press('Escape');
    await expect(second).toBeFocused();
    await page.mouse.move(firstBox.x + firstBox.width / 2 + 2, firstBox.y + firstBox.height / 2);
    await expect(first).toHaveCSS('opacity', '1');
    await expect(second).toHaveCSS('opacity', '0');

    // The focused button was hidden by pointer movement; keyboard input reveals it before acting.
    await page.keyboard.press('Enter');
    await expect(second).toHaveCSS('opacity', '1');
    await expect(first).toHaveCSS('opacity', '0');
    await page.getByRole('menuitem', { name: 'Rename…' }).click();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(second).toBeFocused();
    await rows.nth(0).hover();
    await expect(first).toHaveCSS('opacity', '1');
    await expect(second).toHaveCSS('opacity', '0');

    await rows.nth(0).locator('[data-home-document-ref]').focus();
    await page.keyboard.press('Tab');
    await expect(second).toBeFocused();
    await expect(second).toHaveCSS('opacity', '1');
    await expect(first).toHaveCSS('opacity', '0');
    await page.keyboard.press('Space');
    await expect(page.getByRole('menu')).toBeVisible();
  });

  test('falls back to an available row after deleting the active document', async ({ page, editor }) => {
    await editor.load('basic');
    await homeZoomBreadcrumb(page).click();
    const home = homeView(page);
    const deletedRow = home.locator(`[data-home-document-ref="${editor.docId}"]`).locator('..');
    await deletedRow.getByRole('button', { name: /^Actions for/u }).click();
    await page.getByRole('menuitem', { name: 'Delete…' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(deletedRow).toHaveCount(0);
    await expect(home.getByRole('heading', { name: 'Home', level: 1 })).toBeFocused();
    await page.mouse.move(0, 0);
    await expect(home.getByRole('listitem').first().getByRole('button', { name: /^Actions for/u }))
      .toHaveCSS('opacity', '1');
  });

  test.describe('without hover', () => {
    test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

    test('keeps every row action visible', async ({ page, editor }) => {
      await editor.load('basic');
      await homeZoomBreadcrumb(page).click();
      const buttons = homeView(page).getByRole('button', { name: /^Actions for/u });
      await expect(buttons).toHaveCount(2);
      await expect(buttons.nth(0)).toHaveCSS('opacity', '1');
      await expect(buttons.nth(1)).toHaveCSS('opacity', '1');
      await buttons.nth(1).tap();
      await page.keyboard.press('Escape');
      await expect(buttons.nth(0)).toHaveCSS('opacity', '1');
      await expect(buttons.nth(1)).toHaveCSS('opacity', '1');
    });
  });

  test('opens at its own URL without document controls or a mounted editor', async ({ page, editor }) => {
    await editor.load('basic');
    await homeZoomBreadcrumb(page).click();

    await expect(page).toHaveURL('/');
    await expect(homeSearch(page)).toBeFocused();
    await expect(editorLocator(page)).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Search document', exact: true })).toHaveCount(0);
    await expect(page).toHaveTitle('Home · RemDo');
  });

  test('switches documents from the editor with Cmd/Ctrl+K and returns with Back', async ({ page, editor }) => {
    await editor.load('basic');
    const other = await createUserDocument(page, 'Another document');
    const sourcePath = createEditorDocumentPath(editor.docId);
    await editorLocator(page).locator('.editor-input').focus();

    await page.keyboard.press('ControlOrMeta+K');

    await expect(page).toHaveURL('/');
    await expect(homeSearch(page)).toBeFocused();
    await page.keyboard.type('ANOTHER doc');
    await expect(homeView(page).locator('[data-home-document-ref]')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(createEditorDocumentPath(other.id));

    await page.goBack();
    await expect(page).toHaveURL('/');
    await expect(homeSearch(page)).toHaveValue('');
    await page.goBack();
    await expect(page).toHaveURL(sourcePath);
  });

  test('places the document actions beside the heading above 56px document rows', async ({ page, editor }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await editor.load('basic');
    await homeZoomBreadcrumb(page).click();
    const home = homeView(page);
    const [heading, upload, create, row] = [
      await home.getByRole('heading', { name: 'Home', level: 1 }).boundingBox(),
      await home.getByRole('button', { name: 'Upload document', exact: true }).boundingBox(),
      await home.getByRole('button', { name: 'New document', exact: true }).boundingBox(),
      await home.getByRole('listitem').first().boundingBox(),
    ];

    expect(upload!.x).toBeGreaterThan(heading!.x + heading!.width);
    expect(create!.x).toBeGreaterThan(upload!.x + upload!.width);
    expect(upload!.y + upload!.height / 2).toBeCloseTo(heading!.y + heading!.height / 2, 0);
    expect(row!.height).toBe(56);
  });

  test('opens a listed document at its root and preserves Home in browser history', async ({ page, editor }) => {
    await editor.load('basic');
    const documentPath = createEditorDocumentPath(editor.docId);
    const notePath = createEditorDocumentPath(editor.docId, 'note1');
    await page.goto(notePath);
    await waitForSynced(page);
    await homeZoomBreadcrumb(page).click();
    await expect(page).toHaveURL('/');

    // Keyboard activation of the same document starts at its root, not its old zoom.
    const row = homeView(page).locator(`[data-home-document-ref="${editor.docId}"]`);
    await row.focus();
    await row.press('Enter');
    await expect(page).toHaveURL(documentPath);
    await waitForSynced(page);
    await expect(editorLocator(page).locator('.editor-input')).toBeFocused();

    // Zoom changes the document entry, so Back should still return to Home.
    const search = page.getByRole('combobox', { name: 'Search document' });
    await search.fill('note3');
    await search.press('Enter');
    const nextNotePath = createEditorDocumentPath(editor.docId, 'note3');
    await expect(page).toHaveURL(nextNotePath);

    await page.goBack();
    await expect(page).toHaveURL('/');
    await expect(homeSearch(page)).toBeFocused();
    await page.goBack();
    await expect(page).toHaveURL(notePath);
    await waitForSynced(page);
    await expect(editorLocator(page).locator('.editor-input')).toBeFocused();
    await page.goForward();
    await expect(page).toHaveURL('/');
    await expect(homeView(page)).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(nextNotePath);
    await waitForSynced(page);
    await expect(editorLocator(page)).toBeVisible();
  });

  test('creates a document from Home and returns to Home with Back', async ({ page, editor }) => {
    await editor.load('basic');
    await homeZoomBreadcrumb(page).click();
    const home = homeView(page);
    await expect(home.getByRole('button', { name: 'New document', exact: true })).toBeVisible();
    await expect(home.getByRole('button', { name: 'Upload document' })).toBeVisible();
    await home.getByRole('button', { name: 'New document', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'New document' });
    const input = dialog.getByRole('textbox', { name: 'Document name' });
    await expect(input).toBeFocused();
    await expect(page).toHaveURL('/');
    await input.press('Enter');
    await expect(page).toHaveURL(/\/n\/[^/_]+$/);
    await waitForSynced(page);
    await expect(editorLocator(page)).toBeVisible();
    await expect(editorLocator(page).locator('.editor-input')).toBeFocused();
    await page.goBack();
    await expect(page).toHaveURL('/');
    await expect(homeView(page)).toBeVisible();
  });

  test('cancels a selected suggestion, then replaces it with a name before creating', async ({ page, editor }) => {
    await editor.load('basic');
    await homeZoomBreadcrumb(page).click();
    const home = homeView(page);
    await expect(home.locator(`[data-home-document-ref="${editor.docId}"]`)).toBeVisible();
    const initialCount = await home.getByRole('listitem').count();
    const trigger = home.getByRole('button', { name: 'New document', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'New document' });
    const input = dialog.getByRole('textbox', { name: 'Document name' });
    await expect(input).toBeFocused();
    const suggestion = await input.inputValue();
    expect(await input.evaluate((element: HTMLInputElement) => [element.selectionStart, element.selectionEnd]))
      .toEqual([0, suggestion.length]);
    await input.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(home.getByRole('listitem')).toHaveCount(initialCount);

    await trigger.click();
    await input.pressSequentially('Named before creation');
    await expect(input).toHaveValue('Named before creation');
    await input.press('Enter');
    await expect(page).toHaveURL(/\/n\/[^/_]+$/u);
    await waitForSynced(page);
    await expect(page.getByRole('heading', { name: 'Named before creation', exact: true })).toBeVisible();
    await expect(editorLocator(page).locator('.editor-input')).toBeFocused();
    await homeZoomBreadcrumb(page).click();
    await expect(home.getByRole('button', { name: 'Named before creation', exact: true })).toBeVisible();
  });

  test('leaves document search when navigating Home and reopening the document', async ({ page, editor }) => {
    await editor.load('basic');
    await page.getByRole('combobox', { name: 'Search document' }).fill('note2');
    await expect(page.getByRole('listbox', { name: 'Search results' })).toBeVisible();
    await homeZoomBreadcrumb(page).click();
    await expect(page).toHaveURL('/');
    await homeView(page).locator(`[data-home-document-ref="${editor.docId}"]`).click();
    await waitForSynced(page);
    await expect(page.getByRole('combobox', { name: 'Search document' })).toHaveValue('');
    await expect(editorLocator(page)).toBeVisible();
  });

  test('keeps keyboard focus through a failed creation and retries with Enter', async ({ page, editor }) => {
    await editor.load('basic');
    await homeZoomBreadcrumb(page).click();
    const home = homeView(page);
    await expect(home.locator(`[data-home-document-ref="${editor.docId}"]`)).toBeVisible();
    const before = await home.getByRole('listitem').count();
    let failFirstCreation!: () => void;
    const failure = new Promise<void>((resolve) => { failFirstCreation = resolve; });
    let attempts = 0;
    await page.route('**/api/documents', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      attempts += 1;
      if (attempts === 1) {
        await failure;
        await route.fulfill({ contentType: 'application/json', body: 'invalid json' });
      } else await route.continue();
    });

    await home.getByRole('button', { name: 'New document', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'New document' });
    const input = dialog.getByRole('textbox', { name: 'Document name' });
    await input.fill('Retry from keyboard');
    await dialog.getByRole('button', { name: 'Create document' }).press('Enter');
    await expect.poll(() => attempts).toBe(1);
    await expect(dialog.getByRole('status')).toHaveText('Creating…');
    await expect(input).toBeFocused();
    await input.pressSequentially('ignored while pending');
    await input.press('Enter');
    await expect(input).toHaveValue('Retry from keyboard');
    expect(attempts).toBe(1);

    failFirstCreation();
    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('Retry from keyboard');
    await expect(home.getByRole('listitem')).toHaveCount(before);
    await input.press('Enter');
    await expect(page).toHaveURL(/\/n\/[^/_]+$/u);
    await waitForSynced(page);
    await expect(page.getByRole('heading', { name: 'Retry from keyboard', exact: true })).toBeVisible();
    await expect(editorLocator(page).locator('.editor-input')).toBeFocused();
    expect(attempts).toBe(2);
  });

  test('keeps each document's content when switching between documents through Home', async ({ page, captureCreatedDoc }) => {
    const sourceDocument = await createUserDocument(page, `Source Document ${Date.now()}`);
    await seedDocument(page, sourceDocument.id, 'tree-complex');

    await page.goto(createEditorDocumentPath(sourceDocument.id));
    await waitForSynced(page);
    await expect(editorLocator(page).locator('li.list-item', { hasText: 'note7' }).first()).toBeVisible();

    const createdDocId = await captureCreatedDoc(page, async () => {
      await homeZoomBreadcrumb(page).click();
      await homeView(page).getByRole('button', { name: 'New document', exact: true }).click();
      await page.getByRole('dialog', { name: 'New document' }).getByRole('button', { name: 'Create document' }).click();
    });
    await expect(page).toHaveURL(createEditorDocumentPath(createdDocId));
    await ensureReady(page);
    await load(page, 'flat');
    await waitForSynced(page);

    await openDocumentFromHome(page, sourceDocument.title);
    await expect(page).toHaveURL(createEditorDocumentPath(sourceDocument.id));
    await editorLocator(page).locator('.editor-input').first().waitFor();
    await ensureReady(page);
    await waitForSynced(page);
    await expect(editorLocator(page).locator('li.list-item', { hasText: 'note7' }).first()).toBeVisible();

    await homeZoomBreadcrumb(page).click();
    await homeView(page).locator(`[data-home-document-ref="${createdDocId}"]`).click();
    await expect(page).toHaveURL(createEditorDocumentPath(createdDocId));
    await editorLocator(page).locator('.editor-input').first().waitFor();
    await ensureReady(page);
    await waitForSynced(page);
    await expect(editorLocator(page).locator('li.list-item', { hasText: 'note7' })).toHaveCount(0);
    await expect(editorLocator(page).locator('li.list-item', { hasText: 'note3' }).first()).toBeVisible();
  });
});

async function seedDocument(page: Parameters<typeof editorLocator>[0], docId: string, fixtureName: string) {
  await page.goto(createEditorDocumentPath(docId));
  await editorLocator(page).locator('.editor-input').first().waitFor();
  await ensureReady(page, { clear: true });
  await load(page, fixtureName);
  await waitForSynced(page);
}
