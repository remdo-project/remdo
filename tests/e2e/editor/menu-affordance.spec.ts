import { expect, test } from '#editor/fixtures';
import { documentLocationHeader, editorLocator, homeView, homeZoomBreadcrumb, noteRow } from '#editor/locators';

test('document menus reveal in a stable leading gutter on hover and keyboard focus', async ({ page, editor }) => {
  await editor.load('basic');
  const header = documentLocationHeader(page);
  const heading = header.getByRole('heading');
  const trigger = header.getByRole('button');
  await page.mouse.move(0, 0);
  await expect(trigger).toHaveCSS('opacity', '0');
  const headingBox = (await heading.boundingBox())!;
  await header.hover();
  await expect(trigger).toHaveCSS('opacity', '1');
  expect(await heading.boundingBox()).toEqual(headingBox);
  const triggerBox = (await trigger.boundingBox())!;
  expect(triggerBox.x + triggerBox.width).toBeLessThanOrEqual(headingBox.x);
  await page.mouse.move(0, 0);
  await expect(trigger).toHaveCSS('opacity', '1');
  await noteRow(page, 'note1').hover();
  await expect(trigger).toHaveCSS('opacity', '0');
  const noteTrigger = editorLocator(page).locator('.note-controls__button--menu');
  await expect(noteTrigger).toHaveCSS('opacity', '1');
  await page.mouse.move(0, 0);
  await expect(noteTrigger).toHaveCSS('opacity', '1');
  await header.hover();
  await expect(noteTrigger).toHaveCSS('opacity', '0');
  await trigger.focus();
  await page.mouse.move(0, 0);
  await expect(trigger).toHaveCSS('opacity', '1');
  await noteRow(page, 'note1').hover();
  await expect(trigger).toHaveCSS('opacity', '0');
  await expect(noteTrigger).toHaveCSS('opacity', '1');
  await trigger.press('Space');
  await expect(trigger).toHaveCSS('opacity', '1');
  const noteBox = (await noteRow(page, 'note1').boundingBox())!;
  await page.mouse.move(noteBox.x + noteBox.width / 2, noteBox.y + noteBox.height / 2);
  await expect(noteTrigger).toHaveCSS('opacity', '0');
  await page.getByRole('menuitem', { name: 'Rename…' }).hover();
  await expect(trigger).toHaveCSS('opacity', '1');
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await noteRow(page, 'note1').hover();
  await expect(trigger).toHaveCSS('opacity', '0');
  await expect(noteTrigger).toHaveCSS('opacity', '1');
  await noteRow(page, 'note1').click();
  await page.keyboard.press('ArrowRight');
  await expect(trigger).toHaveCSS('opacity', '0');
  await expect(noteTrigger).toHaveCSS('opacity', '1');

  await homeZoomBreadcrumb(page).click();
  const label = homeView(page).locator(`[data-home-document-ref="${editor.docId}"]`).first();
  const row = label.locator('..');
  const rowTrigger = row.getByRole('button', { name: /^Actions for / });
  await page.mouse.move(0, 0);
  await expect(homeView(page).locator('.note-menu-button').first()).toHaveCSS('opacity', '1');
  await expect(rowTrigger).toHaveCSS('opacity', '0');
  const labelBox = (await label.boundingBox())!;
  await row.hover();
  await expect(rowTrigger).toHaveCSS('opacity', '1');
  expect(await label.boundingBox()).toEqual(labelBox);
  await page.mouse.move(0, 0);
  await expect(rowTrigger).toHaveCSS('opacity', '1');
  const visibleButtons = () => homeView(page).locator('.note-menu-button').evaluateAll((buttons) =>
    buttons.filter((button) => getComputedStyle(button).opacity === '1').length);
  expect(await visibleButtons()).toBe(1);
  const rowTriggerBox = (await rowTrigger.boundingBox())!;
  expect(rowTriggerBox.x + rowTriggerBox.width).toBeLessThanOrEqual(labelBox.x);
  await label.focus();
  await page.mouse.move(0, 0);
  await expect(rowTrigger).toHaveCSS('opacity', '1');
  await label.press('Shift+Tab');
  await expect(rowTrigger).toBeFocused();
  await rowTrigger.press('Enter');
  await expect(page.getByRole('menuitem', { name: 'Rename…' })).toBeVisible();
  await expect(page).toHaveURL('/');
});

for (const dismissal of ['Escape', 'Tab', 'outside', 'cancel rename', 'submit unchanged'] as const) {
  test(`hover resumes after document menu dismissal: ${dismissal}`, async ({ page, editor }) => {
    await editor.load('basic');
    const trigger = documentLocationHeader(page).getByRole('button');
    const noteTrigger = editorLocator(page).locator('.note-controls__button--menu');
    await trigger.click();
    if (dismissal === 'cancel rename' || dismissal === 'submit unchanged') {
      await page.getByRole('menuitem', { name: 'Rename…' }).click();
      if (dismissal === 'cancel rename') {
        await page.getByRole('button', { name: 'Cancel' }).click();
      } else {
        await page.getByRole('textbox', { name: 'Document name' }).press('Enter');
      }
      await expect(page.getByRole('dialog')).toHaveCount(0);
    } else if (dismissal === 'outside') {
      await page.mouse.click(5, 5);
    } else {
      await page.keyboard.press(dismissal);
    }
    await expect(page.getByRole('menu')).toHaveCount(0);
    await noteRow(page, 'note1').hover();
    await expect(trigger).toHaveCSS('opacity', '0');
    await expect(noteTrigger).toHaveCSS('opacity', '1');
    await noteTrigger.click();
    await expect(page.getByRole('menuitem', { name: 'Zoom', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await documentLocationHeader(page).hover();
    await expect(trigger).toHaveCSS('opacity', '1');
    await expect(noteTrigger).toHaveCSS('opacity', '0');
  });
}

test('Home hover and keyboard input resume after closing a row menu', async ({ page, editor }) => {
  await editor.load('basic');
  await homeZoomBreadcrumb(page).click();
  const rows = homeView(page).locator('.home-doc-row');
  const first = rows.nth(0).getByRole('button', { name: /^Actions for / });
  const second = rows.nth(1).getByRole('button', { name: /^Actions for / });
  await first.click();
  await page.keyboard.press('Escape');
  await expect(first).toBeFocused();
  await rows.nth(1).hover();
  await expect(first).toHaveCSS('opacity', '0');
  await expect(second).toHaveCSS('opacity', '1');
  await page.keyboard.press('Enter');
  await expect(first).toHaveCSS('opacity', '1');
  await expect(second).toHaveCSS('opacity', '0');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await rows.nth(1).hover();
  await expect(second).toHaveCSS('opacity', '1');
});

test('returns to the header when search hides the active outline', async ({ page, editor }) => {
  await editor.load('basic');
  await noteRow(page, 'note1').hover();
  const trigger = documentLocationHeader(page).getByRole('button');
  await expect(trigger).toHaveCSS('opacity', '0');
  await page.getByRole('combobox', { name: 'Search document' }).fill('missing result');
  await expect(trigger).toHaveCSS('opacity', '1');
});

test.describe('touch document menus', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('keeps header and Home actions visible and tappable without hover', async ({ page, editor }) => {
    await editor.load('basic');
    const trigger = documentLocationHeader(page).getByRole('button');
    await expect(trigger).toHaveCSS('opacity', '1');
    await trigger.tap();
    await page.getByRole('menuitem', { name: 'Rename…' }).tap();
    await expect(page.getByRole('textbox', { name: 'Document name' })).toBeFocused();
    await page.getByRole('button', { name: 'Cancel' }).tap();
    await homeZoomBreadcrumb(page).tap();
    const row = homeView(page).locator(`[data-home-document-ref="${editor.docId}"]`).first().locator('..');
    const rowTrigger = row.getByRole('button', { name: /^Actions for / });
    await expect(rowTrigger).toHaveCSS('opacity', '1');
    await rowTrigger.tap();
    await expect(page.getByRole('menuitem', { name: 'Rename…' })).toBeVisible();
    await expect(page).toHaveURL('/');
  });
});
