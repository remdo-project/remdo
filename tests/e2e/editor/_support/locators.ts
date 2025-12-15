import type { Locator, Page } from '#editor/fixtures';

export const editorLocator = (page: Page): Locator => page.locator('.editor-container');

export async function setCaretAtText(
  page: Page,
  label: string,
  offset: number | typeof Number.POSITIVE_INFINITY = 0
): Promise<void> {
  const text = editorLocator(page).locator('[data-lexical-text="true"]').filter({ hasText: label }).first();
  await text.evaluate((el, off) => {
    const target = el.firstChild ?? el;
    const length = target.textContent?.length ?? 0;
    const resolved =
      off === Number.POSITIVE_INFINITY
        ? length
        : Math.min(Math.max(typeof off === 'number' ? off : 0, 0), length);

    const selection = globalThis.getSelection();
    if (!selection) throw new Error('No selection available');
    const range = document.createRange();
    range.setStart(target, resolved);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }, offset);
}
