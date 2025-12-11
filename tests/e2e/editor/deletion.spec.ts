import type { Page } from '#editor/fixtures';
import { expect, test } from '#editor/fixtures';
import { editorLocator, setCaretAtText } from './_support/locators';
import { captureEditorSnapshot } from './_support/state';

async function replaceNoteText(page: Page, label: string, nextText: string) {
  await setCaretAtText(page, label);
  const accel = (await isApplePlatform(page)) ? 'Meta+A' : 'Control+A';
  await page.keyboard.press(accel);
  await page.keyboard.type(nextText);
}

async function isApplePlatform(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    const platformSource = nav.userAgentData?.platform ?? nav.userAgent;
    return /Mac(?:intosh)?|iPhone|iPad|iPod/i.test(platformSource);
  });
}

test.describe('deletion (native browser behavior)', () => {
  test('forward Delete at caret removes leading character of first note', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note1');

    await page.keyboard.press('Delete');

    const items = editorLocator(page).locator('li.list-item');
    await expect(items.nth(0)).toHaveText('ote1');
    await expect(items.nth(1)).toHaveText('note2');
    await expect(items.nth(2)).toHaveText('note3');
  });

  test('Backspace at start of first note is a no-op', async ({ page, editor }) => {
    test.fail();
    await editor.load('basic');
    await setCaretAtText(page, 'note1');
    const before = await captureEditorSnapshot(page);

    await page.keyboard.press('Backspace');

    expect(await captureEditorSnapshot(page)).toEqual(before);
  });

  test('Backspace at start of parent with children is a no-op', async ({ page, editor }) => {
    test.fail();
    await editor.load('tree');
    await setCaretAtText(page, 'note2');
    const before = await captureEditorSnapshot(page);

    await page.keyboard.press('Backspace');

    expect(await captureEditorSnapshot(page)).toEqual(before);
  });

  test('Backspace merges a leaf into its previous sibling', async ({ page, editor }) => {
    test.fail();
    await editor.load('flat');
    await setCaretAtText(page, 'note2');

    await page.keyboard.press('Backspace');

    const items = editorLocator(page).locator('li.list-item');
    await expect(items.nth(0)).toHaveText('note1 note2');
    await expect(items.nth(1)).toHaveText('note3');
  });

  test('Delete at end merges next leaf', async ({ page, editor }) => {
    test.fail();
    await editor.load('flat');
    await setCaretAtText(page, 'note1', Number.POSITIVE_INFINITY);

    await page.keyboard.press('Delete');

    const items = editorLocator(page).locator('li.list-item');
    await expect(items.nth(0)).toHaveText('note1 note2');
    await expect(items.nth(1)).toHaveText('note3');
  });

  test('Delete respects spacing when right fragment already starts with space', async ({ page, editor }) => {
    await editor.load('flat');
    await replaceNoteText(page, 'note1', 'left');
    await replaceNoteText(page, 'note2', ' right');
    await setCaretAtText(page, 'left', Number.POSITIVE_INFINITY);

    await page.keyboard.press('Delete');

    const items = editorLocator(page).locator('li.list-item');
    await expect(items.nth(0)).toHaveText('left right');
    await expect(items.nth(1)).toHaveText('note3');
  });

  test('Delete respects spacing when left fragment already ends with space', async ({ page, editor }) => {
    test.fixme();
    await editor.load('flat');
    await replaceNoteText(page, 'note1', 'left ');
    await replaceNoteText(page, 'note2', 'right');
    await setCaretAtText(page, 'left ', Number.POSITIVE_INFINITY);

    await page.keyboard.press('Delete');

    const items = editorLocator(page).locator('li.list-item');
    await expect(items.nth(0)).toHaveText('left right');
    await expect(items.nth(1)).toHaveText('note3');
  });

  test('Delete removes structural selection block and focuses next sibling', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note1');

    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');

    await page.keyboard.press('Delete');

    const items = editorLocator(page).locator('li.list-item');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toHaveText('note2');
    await expect(items.nth(1)).toHaveText('note3');
  });
});
