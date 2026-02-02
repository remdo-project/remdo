import type { Page } from '@playwright/test';
import { editorLocator } from './locators';

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
      // TODO use routes or a similar mechanism to render just editor instead of using CSS tricks
      style.textContent = `
      body *:not(.editor-container):not(.editor-container *):not(:has(.editor-container))
        :not([data-zoom-breadcrumbs]):not([data-zoom-breadcrumbs] *) {
        display: none;
        pointer-events: none;
      }
      .editor-container,
      .editor-container * {
        display: revert;
        pointer-events: auto;
      }
      `;
      document.head.append(style);
    }
  }, STYLE_ID);

  await page.locator('.editor-container').first().waitFor({ state: 'attached' });
  await focusEditorInput(page);
}

async function focusEditorInput(page: Page): Promise<void> {
  const input = editorLocator(page).locator('.editor-input').first();
  await input.waitFor({ state: 'visible' });
  await input.click();
}
