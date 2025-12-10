import type { Page } from './_support/fixtures';
import { expect, test } from './_support/fixtures';
import { editorLocator } from './_support/locators';

async function setCaretAtTextStart(page: Page, label: string) {
  const text = editorLocator(page).locator('[data-lexical-text=\"true\"]').filter({ hasText: label }).first();
  await text.evaluate((el) => {
    const target = el.firstChild ?? el;
    const selection = globalThis.getSelection();
    if (!selection) throw new Error('No selection available');
    const range = document.createRange();
    range.setStart(target, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  });
}

test.describe('deletion (native browser behavior)', () => {
  test('forward Delete at caret removes leading character of first note', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtTextStart(page, 'note1');

    await page.keyboard.press('Delete');

    const items = editorLocator(page).locator('li.list-item');
    await expect(items.nth(0)).toHaveText('ote1');
    await expect(items.nth(1)).toHaveText('note2');
    await expect(items.nth(2)).toHaveText('note3');
  });

  // TODO: add additional cases mirroring docs/outliner/deletion.md:
  // - Backspace at start of parent with children (no-op)
  // - Backspace merge leaf into previous sibling
  // - Delete at end merges next leaf
  // - Spacing rule variants (leading/trailing whitespace)
  // - Structural selection delete focus behavior
});
