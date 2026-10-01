import { expect, test } from '#editor/fixtures';
import { documentShell, editorLocator, homeZoomBreadcrumb, noteRow, setCaretAtText } from '#editor/locators';
import type { Locator, Page } from '#editor/fixtures';

const PLAYWRIGHT_KEYS: Record<string, string> = {
  Control: 'Control',
  Ctrl: 'Control',
  Option: 'Alt',
  Alt: 'Alt',
  '⌘': 'Meta',
  Shift: 'Shift',
  Enter: 'Enter',
  '↑/↓': 'ArrowDown',
};

const toggle = (page: Page): Locator => page.getByRole('button', { name: 'Keyboard reference' });
const reference = (page: Page): Locator => page.getByRole('dialog', { name: 'Keyboard reference' });

async function shownChord(page: Page, action: string): Promise<string> {
  const keys = await reference(page)
    .getByText(action, { exact: true })
    .locator('xpath=..')
    .locator('kbd')
    .evaluateAll((caps) => caps.map((cap) => cap.querySelector('[aria-hidden]')?.textContent ?? cap.textContent));
  return keys.map((key) => PLAYWRIGHT_KEYS[key]!).join('+');
}

test.describe('Keyboard reference', () => {
  test('sits in the document header and opens below it without covering the header controls', async ({ page, editor }) => {
    await editor.load('flat');

    const header = documentShell(page).locator('.document-header');
    await expect(header.getByRole('button', { name: 'Keyboard reference' })).toBeVisible();

    await toggle(page).click();

    const controlBox = (await toggle(page).boundingBox())!;
    const panelBox = (await reference(page).boundingBox())!;
    const searchBox = (await header.getByRole('combobox', { name: 'Search document' }).boundingBox())!;
    expect(panelBox.y).toBeGreaterThanOrEqual(controlBox.y + controlBox.height);
    expect(panelBox.y).toBeGreaterThanOrEqual(searchBox.y + searchBox.height);
  });

  test('stays open while the user edits, using the keys it shows', async ({ page, editor }) => {
    await editor.load('flat');
    await toggle(page).click();
    await expect(reference(page)).toBeFocused();

    await setCaretAtText(page, 'note2', Number.POSITIVE_INFINITY);
    await page.keyboard.press(await shownChord(page, 'Toggle checked'));

    await expect(reference(page)).toBeVisible();
    await expect(noteRow(page, 'note2')).toHaveAttribute('data-note-checked', 'true');
  });

  test('closes on Escape from within and returns to the editor at the same note', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note2', 2);
    await toggle(page).click();
    await expect(reference(page)).toBeFocused();

    await page.keyboard.press('Escape');

    await expect(reference(page)).toHaveCount(0);
    await expect(editorLocator(page).locator('.editor-input')).toBeFocused();
    await page.keyboard.press('Control+Enter');
    await expect(noteRow(page, 'note2')).toHaveAttribute('data-note-checked', 'true');
  });

  test('is not offered on Home', async ({ page, editor }) => {
    await editor.load('flat');
    await expect(toggle(page)).toBeVisible();

    await homeZoomBreadcrumb(page).click();

    await expect(page).toHaveURL('/');
    await expect(toggle(page)).toHaveCount(0);
  });

  test.describe('on a touch device', () => {
    test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

    test('is not offered', async ({ page, editor }) => {
      await editor.load('flat');

      await expect(page.getByRole('toolbar', { name: 'Note actions' })).toBeVisible();
      await expect(toggle(page)).toHaveCount(0);
    });
  });
});
