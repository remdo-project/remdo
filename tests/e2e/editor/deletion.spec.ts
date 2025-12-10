import type { Page } from '@playwright/test';
import { expect, test } from '../_support/fixtures';

async function setCaretAtTextStart(page: Page, label: string) {
  await page.locator('.editor-input').first().click(); // ensure focus
  await page.evaluate((targetLabel: string) => {
    const textNode = Array.from(
      document.querySelectorAll<HTMLElement>('[data-lexical-text="true"]')
    ).map((el) => el.firstChild)
      .find((node) => node && node.textContent?.trim() === targetLabel);
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
      throw new Error(`Text node not found for label: ${targetLabel}`);
    }
    const selection = globalThis.getSelection();
    if (!selection) throw new Error('No selection available');
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }, label);
}

test.describe('deletion (native browser behavior)', () => {
  test('forward Delete at caret removes leading character of first note', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtTextStart(page, 'note1');

    await page.keyboard.press('Delete');

    const items = page.locator('li.list-item');
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
