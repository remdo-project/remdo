import { expect, isolatedTest as test } from '#editor/fixtures';
import { editorLocator, noteRow as row, setCaretAtText } from '#editor/locators';
import { openNoteMenu } from './_support/menu';

test.describe('Document layout', () => {
  test('sets outline rows 32px apart and indents nested notes by 32px', async ({ page, editor }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await editor.load('tree');
    const textBox = async (name: string) => (await editorLocator(page).locator('[data-lexical-text="true"]', { hasText: name }).first().boundingBox())!;
    const [note1, note2, note3] = [await textBox('note1'), await textBox('note2'), await textBox('note3')];

    expect(note2.y - note1.y).toBeCloseTo(32, 0);
    expect(note3.y - note2.y).toBeCloseTo(32, 0);
    expect(note3.x - note2.x).toBeCloseTo(32, 0);
  });

  for (const fixture of ['tree', 'tree-ordered-root']) {
    test(`sets a top-level subtree 12px apart from the next top-level note in ${fixture}`, async ({ page, editor }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await editor.load(fixture);
      await setCaretAtText(page, 'note3', Number.POSITIVE_INFINITY);
      await page.keyboard.press('Enter');
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.type('appended');
      const top = async (label: string) => (await row(page, label).boundingBox())!.y;

      await expect.poll(async () => (await top('appended')) - (await top('note3'))).toBeCloseTo(44, 0);
    });
  }

  test('sets the note menu in a 280px panel with 36px items', async ({ page, editor }) => {
    await editor.load('tree');
    const menu = await openNoteMenu(page, 'note2', { anchor: 'caret', openMethod: 'shortcut' });
    const panel = (await menu.menu.boundingBox())!;
    const item = (await menu.itemOrder.first().boundingBox())!;

    expect(panel.width).toBeGreaterThanOrEqual(280);
    expect(item.height).toBe(36);
  });

  test('sets the rename dialog with a 22px title, a 44px input and 48px buttons', async ({ page, editor }) => {
    await editor.load('basic');
    await page.getByRole('heading', { level: 1 }).hover();
    await page.getByRole('button', { name: /^Actions for/u }).click();
    await page.getByRole('menuitem', { name: /^Rename/u }).click();
    const dialog = page.getByRole('dialog');
    const input = (await dialog.getByLabel('Document name').boundingBox())!;
    const cancel = (await dialog.getByRole('button', { name: 'Cancel', exact: true }).boundingBox())!;
    const titleSize = await dialog.getByRole('heading').evaluate((element) => getComputedStyle(element).fontSize);

    expect(titleSize).toBe('22px');
    expect(input.height).toBe(44);
    expect(cancel.height).toBe(48);
  });

  test('stacks the breadcrumb and search controls without horizontal overflow on narrow screens', async ({ page, editor }) => {
    await editor.load('basic');
    await page.setViewportSize({ width: 375, height: 812 });
    await editorLocator(page).locator('.editor-input').first().waitFor();

    const shell = editorLocator(page)
      .locator('xpath=ancestor-or-self::*[contains(@class,"document-editor-shell")]');
    const breadcrumbs = shell.locator('.document-header-breadcrumbs');
    const actions = shell.locator('.document-header-actions');
    await expect(breadcrumbs).toBeVisible();
    await expect(actions).toBeVisible();

    const [breadcrumbsBox, actionsBox] = await Promise.all([
      breadcrumbs.boundingBox(),
      actions.boundingBox(),
    ]);
    expect(breadcrumbsBox).not.toBeNull();
    expect(actionsBox).not.toBeNull();
    expect(actionsBox!.y).toBeGreaterThanOrEqual(breadcrumbsBox!.y + breadcrumbsBox!.height);

    const overflow = await page.evaluate(() => ({
      header: document.querySelector<HTMLElement>('.document-header')!.scrollWidth -
        document.querySelector<HTMLElement>('.document-header')!.clientWidth,
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    expect(overflow).toEqual({ header: 0, page: 0 });
  });
});
