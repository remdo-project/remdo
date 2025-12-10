import type { Page } from '@playwright/test';

const STYLE_ID = 'remdo-editor-focus-style';

/**
 * Visually de-emphasizes everything except the editor container for editor-focused tests.
 * No DOM shape changes; only adds a scoped style tag.
 */
export async function prepareEditorTestSurface(page: Page): Promise<void> {
  await page.evaluate((styleId) => {
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        body * { visibility: hidden !important; pointer-events: none !important; }
        .editor-container, .editor-container * { visibility: visible !important; pointer-events: auto !important; }
      `;
      document.head.append(style);
    }
  }, STYLE_ID);

  await page.locator('.editor-container').first().waitFor({ state: 'attached' });
}
