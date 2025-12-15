import { expect, test } from '#editor/fixtures';
import { editorLocator, setCaretAtText } from './_support/locators';
import { captureEditorSnapshot } from './_support/state';

async function getListItemTextsRaw(page: Parameters<typeof editorLocator>[0]): Promise<string[]> {
  const items = editorLocator(page).locator('li.list-item');
  const count = await items.count();
  const result: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const text = await items.nth(i).locator('[data-lexical-text="true"]').evaluate((el) => el.textContent);
    result.push(text);
  }
  return result;
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

  test('Backspace in the middle of a note deletes the previous character', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note1', 2);

    await page.keyboard.press('Backspace');

    const items = editorLocator(page).locator('li.list-item');
    await expect(items.nth(0)).toHaveText('nte1');
    await expect(items.nth(1)).toHaveText('note2');
    await expect(items.nth(2)).toHaveText('note3');

    const snapshot = await captureEditorSnapshot(page);
    expect(snapshot.selection).toMatchObject({
      anchorText: 'nte1',
      anchorOffset: 1,
      focusText: 'nte1',
      focusOffset: 1,
      isCollapsed: true,
    });
  });

  test('Backspace at start of first note is a no-op', async ({ page, editor }) => {
    await editor.load('basic');
    await setCaretAtText(page, 'note1');
    const before = await captureEditorSnapshot(page);

    await page.keyboard.press('Backspace');

    expect(await captureEditorSnapshot(page)).toEqual(before);
  });

  test('Backspace at start of parent with children is a no-op', async ({ page, editor }) => {
    await editor.load('tree');
    await setCaretAtText(page, 'note2');
    const before = await captureEditorSnapshot(page);

    await page.keyboard.press('Backspace');

    expect(await captureEditorSnapshot(page)).toEqual(before);
  });

  test('Backspace merges a leaf into its previous sibling', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note2');

    await page.keyboard.press('Backspace');

    const items = editorLocator(page).locator('li.list-item');
    await expect(items.nth(0)).toHaveText('note1 note2');
    await expect(items.nth(1)).toHaveText('note3');
  });

  test('Delete at end merges next leaf', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note1', Number.POSITIVE_INFINITY);

    await page.keyboard.press('Delete');

    const items = editorLocator(page).locator('li.list-item');
    await expect(items.nth(0)).toHaveText('note1 note2');
    await expect(items.nth(1)).toHaveText('note3');
  });

  test('Delete respects spacing when right fragment already starts with space', async ({ page, editor }) => {
    await editor.load('edge-spaces');
    await setCaretAtText(page, 'note1', Number.POSITIVE_INFINITY);

    await page.keyboard.press('Delete');

    await expect
      .poll(() => getListItemTextsRaw(page))
      .toEqual(['note1 note2-space-left', 'note3', 'note4-space-right ', 'note5']);
  });

  test('Delete respects spacing when left fragment already ends with space', async ({ page, editor }) => {
    await editor.load('edge-spaces');
    await setCaretAtText(page, 'note4-space-right', Number.POSITIVE_INFINITY);

    await page.keyboard.press('Delete');

    await expect
      .poll(() => getListItemTextsRaw(page))
      .toEqual(['note1', ' note2-space-left', 'note3', 'note4-space-right note5']);
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
