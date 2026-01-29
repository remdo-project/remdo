import type { Locator, Page } from '#editor/fixtures';

export const editorLocator = (page: Page): Locator => page.locator('.editor-container');

export async function setCaretAtText(
  page: Page,
  label: string,
  offset: number | typeof Number.POSITIVE_INFINITY = 0
): Promise<void> {
  const text = editorLocator(page).locator('[data-lexical-text="true"]').filter({ hasText: label }).first();
  const inputHandle = await text.evaluateHandle((el) => el.closest('.editor-input'));
  const input = inputHandle.asElement();
  if (!input) {
    throw new Error('Editor input not found for caret selection.');
  }
  await input.evaluate((el) => {
    if (el instanceof HTMLElement) {
      el.focus();
    }
  });
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
    document.dispatchEvent(new Event('selectionchange'));
  }, offset);
  await page.waitForFunction(
    ({ input, expected }) => {
      const sel = globalThis.getSelection();
      if (!sel || sel.rangeCount === 0) return false;
      const anchorNode = sel.anchorNode;
      if (!anchorNode || !input.contains(anchorNode)) return false;
      const textContent = anchorNode.textContent ?? '';
      return textContent.includes(expected);
    },
    { input, expected: label }
  );
  await input.dispose();
}
