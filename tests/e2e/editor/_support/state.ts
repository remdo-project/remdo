import type { Page } from '#editor/fixtures';
import { editorLocator } from './locators';

export async function captureEditorSnapshot(page: Page) {
  const html = await editorLocator(page).innerHTML();

  const selection = await page.evaluate(() => {
    const sel = globalThis.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const anchorNode = sel.anchorNode;
    const focusNode = sel.focusNode;
    const anchorText = anchorNode?.textContent ?? null;
    const focusText = focusNode?.textContent ?? null;
    return {
      anchorText,
      anchorOffset: sel.anchorOffset,
      focusText,
      focusOffset: sel.focusOffset,
      isCollapsed: sel.isCollapsed,
    };
  });

  return { html, selection };
}
